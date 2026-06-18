var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/enablebanking.ts
var EB_API = "https://api.enablebanking.com";
async function makeJwt(applicationId, privateKeyPem) {
  console.log("[EB] makeJwt: building JWT for app", applicationId);
  const pemBody = privateKeyPem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "").replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "").replace(/\s/g, "");
  console.log("[EB] makeJwt: PEM body length after strip:", pemBody.length);
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  console.log("[EB] makeJwt: key imported successfully");
  const now = Math.floor(Date.now() / 1e3);
  const b64u = /* @__PURE__ */ __name((obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "b64u");
  const header = b64u({ alg: "RS256", typ: "JWT", kid: applicationId });
  const payload = b64u({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600, app: applicationId });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  console.log("[EB] makeJwt: JWT signed, token length:", `${header}.${payload}.${sigB64}`.length);
  return `${header}.${payload}.${sigB64}`;
}
__name(makeJwt, "makeJwt");
async function ebFetch(path, appId, privKey, init) {
  console.log("[EB] ebFetch:", init?.method ?? "GET", path);
  const jwt = await makeJwt(appId, privKey);
  const res = await fetch(`${EB_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", ...init?.headers ?? {} }
  });
  console.log("[EB] ebFetch response:", res.status, path);
  return res;
}
__name(ebFetch, "ebFetch");
async function ebGetAspsps(appId, privKey, country, search) {
  const res = await ebFetch(`/aspsps?country=${country}`, appId, privKey);
  if (!res.ok) throw new Error(`GET /aspsps failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (search && data.aspsps) {
    const q = search.toLowerCase();
    return { aspsps: data.aspsps.filter((a) => a.name.toLowerCase().includes(q)) };
  }
  return data;
}
__name(ebGetAspsps, "ebGetAspsps");
async function ebStartAuth(appId, privKey, redirectUrl, aspspName, aspspCountry) {
  console.log("[EB] ebStartAuth: aspsp=", aspspName, aspspCountry, "redirect=", redirectUrl);
  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1e3).toISOString();
  const res = await ebFetch("/auth", appId, privKey, {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: aspspName, country: aspspCountry },
      state: crypto.randomUUID(),
      redirect_url: redirectUrl,
      psu_type: "personal"
    })
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[EB] ebStartAuth failed:", res.status, body);
    throw new Error(`Auth start failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  console.log("[EB] ebStartAuth success: authorization_id=", data.authorization_id);
  return { authorization_id: data.authorization_id, auth_url: data.url };
}
__name(ebStartAuth, "ebStartAuth");
async function ebExchangeAndSync(appId, privKey, code, fromDate, toDate) {
  console.log("[EB] ebExchangeAndSync: exchanging code for session");
  const sessRes = await ebFetch("/sessions", appId, privKey, {
    method: "POST",
    body: JSON.stringify({ code })
  });
  if (!sessRes.ok) {
    const body = await sessRes.text();
    console.error("[EB] session exchange failed:", sessRes.status, body);
    throw new Error(`Session exchange failed (${sessRes.status}): ${body}`);
  }
  const session = await sessRes.json();
  console.log("[EB] session_id=", session.session_id, "| accounts in response:", session.accounts?.length ?? 0);
  const accounts = session.accounts ?? [];
  if (accounts.length === 0) throw new Error("Keine autorisierten Konten in der Session");
  const dateFrom = fromDate.toISOString().slice(0, 10);
  const dateTo = toDate.toISOString().slice(0, 10);
  console.log("[EB] date range", dateFrom, "\u2192", dateTo);
  const mappedAccounts = [];
  const mappedTransactions = [];
  function ckAccountId(ck) {
    try {
      const b64 = ck.split(".")[0];
      const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
      const decoded = JSON.parse(atob(padded));
      return decoded.params?.accountId ?? null;
    } catch {
      return null;
    }
  }
  __name(ckAccountId, "ckAccountId");
  await Promise.all(accounts.map(async (acct) => {
    const iban = acct.identification?.iban ?? acct.uid;
    console.log("[EB] fetching transactions for account:", iban);
    const txRes = await ebFetch(
      `/accounts/${acct.uid}/transactions?date_from=${dateFrom}&date_to=${dateTo}`,
      appId,
      privKey
    );
    if (!txRes.ok) {
      console.error("[EB] tx fetch failed for uid:", acct.uid, txRes.status, await txRes.text());
      return;
    }
    const allTxs = [];
    let continuationKey;
    const firstData = await txRes.json();
    if (firstData.transactions?.[0]) {
      console.log("[EB] sample tx fields:", JSON.stringify(firstData.transactions[0]));
    }
    allTxs.push(...firstData.transactions ?? []);
    continuationKey = firstData.continuation_key;
    while (continuationKey) {
      const pageId = ckAccountId(continuationKey) ?? acct.uid;
      console.log("[EB] fetching next page, pageId:", pageId, "ck:", continuationKey.slice(0, 40) + "...");
      const pageRes = await ebFetch(
        `/accounts/${pageId}/transactions?continuation_key=${continuationKey}`,
        appId,
        privKey
      );
      if (!pageRes.ok) {
        console.error("[EB] pagination failed:", pageRes.status, await pageRes.text());
        break;
      }
      const pageData = await pageRes.json();
      allTxs.push(...pageData.transactions ?? []);
      continuationKey = pageData.continuation_key;
    }
    console.log("[EB] account:", iban, "| total transactions:", allTxs.length);
    const closingBal = acct.balances?.find((b) => b.balance_type === "closingBooked") ?? acct.balances?.[0];
    mappedAccounts.push({
      iban,
      blz: iban.slice(4, 12),
      accountNumber: iban.slice(12),
      owner: acct.owner_name ?? "",
      description: acct.name ?? "Konto",
      type: "giro",
      currency: acct.currency,
      balance: closingBal ? parseFloat(closingBal.balance_amount.amount) : 0,
      balanceDate: dateTo
    });
    for (const tx of allTxs) {
      const rawAmount = parseFloat(tx.transaction_amount.amount);
      const isExpense = tx.credit_debit_indicator === "DBIT" || rawAmount < 0;
      const amount = isExpense ? -Math.abs(rawAmount) : Math.abs(rawAmount);
      mappedTransactions.push({
        date: tx.booking_date ?? tx.transaction_date ?? "",
        amount,
        description: tx.remittance_information?.join(" ") ?? "",
        counterparty: isExpense ? tx.creditor?.name ?? "" : tx.debtor?.name ?? "",
        counterpartyIban: isExpense ? tx.creditor_account?.iban ?? "" : tx.debtor_account?.iban ?? "",
        accountIban: iban
      });
    }
  }));
  console.log("[EB] done: accounts=", mappedAccounts.length, "transactions=", mappedTransactions.length);
  return { accounts: mappedAccounts, transactions: mappedTransactions };
}
__name(ebExchangeAndSync, "ebExchangeAndSync");

// src/db.ts
function norm(s) {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
__name(norm, "norm");
function normDate(d) {
  const dt = new Date(d);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return d.slice(0, 10);
}
__name(normDate, "normDate");
function counterpartyIbanOf(r) {
  return r.iban ?? r.counterpartyIban ?? "";
}
__name(counterpartyIbanOf, "counterpartyIbanOf");
var DEDUP_TOL_DAYS = 2;
var SOURCE_RANK = { csv: 1, eb: 2, creditcard: 3 };
function rankOf(source) {
  return SOURCE_RANK[source ?? ""] ?? 0;
}
__name(rankOf, "rankOf");
function matchKey(amount, counterparty) {
  return `${Math.round(amount * 100)}|${norm(counterparty)}`;
}
__name(matchKey, "matchKey");
function dayNumber(dateStr) {
  return Math.floor(new Date(dateStr).getTime() / 864e5);
}
__name(dayNumber, "dayNumber");
function rowToStored(r) {
  return {
    id: r.id,
    date: r.date,
    amount: r.amount,
    type: r.type,
    description: r.description,
    counterparty: r.counterparty,
    iban: r.iban,
    accountIban: r.account_iban,
    reference: r.reference,
    categoryId: r.category_id,
    customLabel: r.custom_label,
    customIcon: r.custom_icon,
    source: r.source,
    parentId: r.parent_id
  };
}
__name(rowToStored, "rowToStored");
async function countRows(db) {
  const r = await db.prepare("SELECT COUNT(*) AS c FROM transactions").first();
  return r?.c ?? 0;
}
__name(countRows, "countRows");
async function getTransactions(db) {
  const { results } = await db.prepare("SELECT * FROM transactions ORDER BY date DESC, rowid ASC").all();
  return (results ?? []).map(rowToStored);
}
__name(getTransactions, "getTransactions");
function toStored(rows, source) {
  return rows.filter((r) => !r.isPending && r.date).map((r) => ({
    id: crypto.randomUUID(),
    date: normDate(r.date),
    amount: r.amount,
    type: r.type ?? (r.amount >= 0 ? "income" : "expense"),
    description: r.description ?? "",
    counterparty: r.counterparty ?? "",
    iban: counterpartyIbanOf(r) || null,
    accountIban: r.accountIban ?? null,
    reference: r.reference ?? null,
    categoryId: r.categoryId ?? null,
    customLabel: r.customLabel ?? null,
    customIcon: r.customIcon ?? null,
    source,
    parentId: r.parentId ?? null
  }));
}
__name(toStored, "toStored");
async function mergeTransactions(db, rows, source) {
  const incoming = rows.filter((r) => !r.isPending && r.date);
  const { results: existing } = await db.prepare("SELECT id, date, amount, counterparty, source, category_id, custom_label, custom_icon FROM transactions").all();
  const index = /* @__PURE__ */ new Map();
  const looseIndex = /* @__PURE__ */ new Map();
  for (const e of existing ?? []) {
    const entry = {
      id: e.id,
      day: dayNumber(e.date),
      source: e.source,
      category_id: e.category_id,
      custom_label: e.custom_label,
      custom_icon: e.custom_icon
    };
    const k = matchKey(e.amount, e.counterparty);
    const arr = index.get(k) ?? [];
    arr.push(entry);
    index.set(k, arr);
    const cents = Math.round(e.amount * 100);
    const looseArr = looseIndex.get(cents) ?? [];
    looseArr.push(entry);
    looseIndex.set(cents, looseArr);
  }
  const claimed = /* @__PURE__ */ new Set();
  const toDelete = [];
  const toInsertRows = [];
  const incomingRank = rankOf(source);
  for (const r of incoming) {
    const day = dayNumber(r.date);
    const candidates = (index.get(matchKey(r.amount, r.counterparty)) ?? []).filter((c) => !claimed.has(c.id));
    let best = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
      const diff = Math.abs(day - c.day);
      if (diff <= DEDUP_TOL_DAYS && diff < bestDiff) {
        best = c;
        bestDiff = diff;
      }
    }
    if (best) {
      claimed.add(best.id);
      if (incomingRank > rankOf(best.source)) {
        toDelete.push(best.id);
        toInsertRows.push({
          ...r,
          categoryId: r.categoryId ?? best.category_id ?? void 0,
          customLabel: r.customLabel ?? best.custom_label ?? void 0,
          customIcon: r.customIcon ?? best.custom_icon ?? void 0
        });
      }
      continue;
    }
    if (source === "eb") {
      const cents = Math.round(r.amount * 100);
      const looseMatch = (looseIndex.get(cents) ?? []).find((c) => !claimed.has(c.id) && c.source === "csv" && Math.abs(day - c.day) <= DEDUP_TOL_DAYS);
      if (looseMatch) {
        claimed.add(looseMatch.id);
        continue;
      }
    }
    toInsertRows.push(r);
  }
  const toInsert = toStored(toInsertRows, source);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmts = [];
  for (const id of toDelete) {
    stmts.push(db.prepare("DELETE FROM transactions WHERE id = ?").bind(id));
  }
  for (const t of toInsert) {
    stmts.push(
      db.prepare(
        `INSERT INTO transactions
           (id, date, amount, type, description, counterparty, iban, account_iban, reference, category_id, custom_label, custom_icon, source, parent_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        t.id,
        t.date,
        t.amount,
        t.type,
        t.description,
        t.counterparty,
        t.iban,
        t.accountIban,
        t.reference,
        t.categoryId,
        t.customLabel,
        t.customIcon,
        t.source,
        t.parentId,
        now
      )
    );
  }
  if (stmts.length) await db.batch(stmts);
  const total = await countRows(db);
  return { added: toInsert.length - toDelete.length, total };
}
__name(mergeTransactions, "mergeTransactions");
async function updateTransaction(db, id, patch) {
  const fields = [];
  const vals = [];
  if ("categoryId" in patch) {
    fields.push("category_id=?");
    vals.push(patch.categoryId ?? null);
  }
  if ("customLabel" in patch) {
    fields.push("custom_label=?");
    vals.push(patch.customLabel ?? null);
  }
  if ("customIcon" in patch) {
    fields.push("custom_icon=?");
    vals.push(patch.customIcon ?? null);
  }
  if (!fields.length) return;
  await db.prepare(`UPDATE transactions SET ${fields.join(", ")} WHERE id=?`).bind(...vals, id).run();
}
__name(updateTransaction, "updateTransaction");
async function deleteTransaction(db, id) {
  await db.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
}
__name(deleteTransaction, "deleteTransaction");
async function clearTransactions(db) {
  await db.prepare("DELETE FROM transactions").run();
}
__name(clearTransactions, "clearTransactions");
var ERROR_CAP = 300;
async function insertError(db, entry) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare(
    `INSERT INTO errors (id, time, context, message, stack, device, created_at) VALUES (?,?,?,?,?,?,?)`
  ).bind(entry.id, entry.time, entry.context, entry.message, entry.stack ?? null, entry.device ?? null, now).run();
  await db.prepare(
    `DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY time DESC LIMIT ?)`
  ).bind(ERROR_CAP).run();
}
__name(insertError, "insertError");
async function getErrors(db) {
  const { results } = await db.prepare("SELECT id, time, context, message, stack, device FROM errors ORDER BY time DESC").all();
  return results ?? [];
}
__name(getErrors, "getErrors");
async function clearErrors(db) {
  await db.prepare("DELETE FROM errors").run();
}
__name(clearErrors, "clearErrors");

// src/index.ts
var ALLOWED_ORIGINS = [
  "https://hansd3rkann5.github.io"
];
var LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;
function corsHeaders(requestOrigin) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) || LOCALHOST_ORIGIN.test(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function checkAuth(request, env) {
  if (!env.API_KEY) return false;
  return request.headers.get("X-Api-Key") === env.API_KEY;
}
__name(checkAuth, "checkAuth");
function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
__name(jsonResponse, "jsonResponse");
var index_default = {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin") ?? ALLOWED_ORIGINS[0];
    const cors = corsHeaders(requestOrigin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    if (request.method === "GET" && /^\/icon\/.+/.test(path)) {
      if (!env.ICONS) return new Response("R2 not configured", { status: 503, headers: cors });
      const key = decodeURIComponent(path.slice("/icon/".length));
      const obj = await env.ICONS.get(key);
      if (!obj) return new Response("Not found", { status: 404, headers: cors });
      const h = new Headers(cors);
      h.set("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
      h.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(obj.body, { headers: h });
    }
    if (request.method === "GET" && path === "/ping") {
      if (!checkAuth(request, env)) return jsonResponse({ error: "Unauthorized" }, 401, cors);
      return jsonResponse({ ok: true }, 200, cors);
    }
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401, cors);
    }
    if (request.method === "GET" && path === "/transactions") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      const transactions = await getTransactions(env.DB);
      return jsonResponse({ transactions }, 200, cors);
    }
    if (request.method === "POST" && path === "/transactions/merge") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      const meta = await mergeTransactions(env.DB, body.transactions ?? [], body.source ?? "csv");
      const transactions = await getTransactions(env.DB);
      return jsonResponse({ transactions, meta }, 200, cors);
    }
    if (request.method === "POST" && path === "/transactions/update") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      if (!body.id) return jsonResponse({ error: "id fehlt" }, 400, cors);
      const patch = {};
      if ("categoryId" in body) patch.categoryId = body.categoryId;
      if ("customLabel" in body) patch.customLabel = body.customLabel;
      if ("customIcon" in body) patch.customIcon = body.customIcon;
      await updateTransaction(env.DB, body.id, patch);
      return jsonResponse({ ok: true }, 200, cors);
    }
    if (request.method === "DELETE" && path.startsWith("/transactions/")) {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      const id = path.slice("/transactions/".length);
      if (!id) return jsonResponse({ error: "id fehlt" }, 400, cors);
      await deleteTransaction(env.DB, id);
      return jsonResponse({ ok: true }, 200, cors);
    }
    if (request.method === "POST" && path === "/transactions/clear") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      await clearTransactions(env.DB);
      return jsonResponse({ ok: true }, 200, cors);
    }
    if (request.method === "POST" && path === "/errors") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      if (!body.id || !body.time || !body.context || !body.message) {
        return jsonResponse({ error: "Fehlende Felder" }, 400, cors);
      }
      await insertError(env.DB, {
        id: body.id,
        time: body.time,
        context: body.context,
        message: body.message,
        stack: body.stack,
        device: body.device
      });
      return jsonResponse({ ok: true }, 200, cors);
    }
    if (request.method === "GET" && path === "/errors") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      const errors = await getErrors(env.DB);
      return jsonResponse({ errors }, 200, cors);
    }
    if (request.method === "POST" && path === "/errors/clear") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      await clearErrors(env.DB);
      return jsonResponse({ ok: true }, 200, cors);
    }
    if (request.method === "GET" && path === "/eb/aspsps") {
      if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) {
        return jsonResponse({ error: "EnableBanking nicht konfiguriert" }, 503, cors);
      }
      const country = url.searchParams.get("country") ?? "DE";
      const search = url.searchParams.get("search") ?? void 0;
      try {
        const data = await ebGetAspsps(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, country, search);
        return jsonResponse(data, 200, cors);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors);
      }
    }
    if (request.method === "POST" && path === "/eb/start") {
      if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) {
        return jsonResponse({ error: "EnableBanking nicht konfiguriert (EB_APPLICATION_ID, EB_PRIVATE_KEY)" }, 503, cors);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      try {
        const result = await ebStartAuth(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, body.redirect_url, body.aspsp_name ?? "Commerzbank", body.aspsp_country ?? "DE");
        return jsonResponse(result, 200, cors);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors);
      }
    }
    if (request.method === "POST" && path === "/eb/sync") {
      if (!env.EB_APPLICATION_ID || !env.EB_PRIVATE_KEY) {
        return jsonResponse({ error: "EnableBanking nicht konfiguriert" }, 503, cors);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      const daysBack = Math.min(body.days ?? 90, 365);
      const toDate = /* @__PURE__ */ new Date();
      const fromDate = new Date(toDate.getTime() - daysBack * 864e5);
      try {
        const result = await ebExchangeAndSync(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, body.code, fromDate, toDate);
        return jsonResponse(await buildSyncResponse(env, result, "eb", fromDate, toDate), 200, cors);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors);
      }
    }
    if (request.method === "POST" && path.endsWith("/upload-icon")) {
      if (!env.ICONS) return jsonResponse({ error: "R2 not configured" }, 503, cors);
      const contentType = request.headers.get("Content-Type") ?? "image/webp";
      const ext = contentType.split("/")[1]?.split(";")[0] ?? "webp";
      const body = await request.arrayBuffer();
      if (body.byteLength > 2 * 1024 * 1024) {
        return jsonResponse({ error: "Image too large (max 2 MB)" }, 413, cors);
      }
      const key = `${crypto.randomUUID()}.${ext}`;
      await env.ICONS.put(key, body, { httpMetadata: { contentType } });
      const iconUrl = new URL(`/icon/${key}`, url.origin).toString();
      return jsonResponse({ url: iconUrl, key }, 200, cors);
    }
    if (request.method === "GET" && path === "/state") {
      if (!env.ICONS) return jsonResponse({ error: "R2 not configured" }, 503, cors);
      const obj = await env.ICONS.get("state/user.json");
      if (!obj) return new Response("null", { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      const h = new Headers(cors);
      h.set("Content-Type", "application/json");
      return new Response(obj.body, { status: 200, headers: h });
    }
    if (request.method === "PUT" && path === "/state") {
      if (!env.ICONS) return jsonResponse({ error: "R2 not configured" }, 503, cors);
      const body = await request.text();
      if (body.length > 20 * 1024 * 1024) return jsonResponse({ error: "State too large (max 20 MB)" }, 413, cors);
      await env.ICONS.put("state/user.json", body, { httpMetadata: { contentType: "application/json" } });
      return jsonResponse({ ok: true }, 200, cors);
    }
    return jsonResponse({ error: "Not found" }, 404, cors);
  }
};
async function buildSyncResponse(env, result, source, fromDate, toDate) {
  let transactions;
  let added;
  let total;
  if (env.DB) {
    const meta = await mergeTransactions(env.DB, result.transactions, source);
    added = meta.added;
    total = meta.total;
    transactions = await getTransactions(env.DB);
  } else {
    transactions = toStored(result.transactions, source);
    added = transactions.length;
    total = transactions.length;
  }
  return {
    accounts: result.accounts,
    transactions,
    meta: {
      accountCount: result.accounts.length,
      count: total,
      added,
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
__name(buildSyncResponse, "buildSyncResponse");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
