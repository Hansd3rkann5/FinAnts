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
  const validUntil = new Date(Date.now() + 180 * 24 * 60 * 60 * 1e3).toISOString();
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
var EbSessionExpiredError = class extends Error {
  static {
    __name(this, "EbSessionExpiredError");
  }
  constructor() {
    super("EnableBanking-Session abgelaufen");
  }
};
async function ebExchangeCode(appId, privKey, code) {
  console.log("[EB] ebExchangeCode: exchanging code for session");
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
  return {
    sessionId: session.session_id,
    accounts,
    validUntil: session.access?.valid_until ?? null
  };
}
__name(ebExchangeCode, "ebExchangeCode");
async function ebFetchData(appId, privKey, accounts, fromDate, toDate) {
  const dateFrom = fromDate.toISOString().slice(0, 10);
  const dateTo = toDate.toISOString().slice(0, 10);
  console.log("[EB] date range", dateFrom, "\u2192", dateTo);
  const mappedAccounts = [];
  const mappedTransactions = [];
  let authFailures = 0;
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
    console.log("[EB] account raw:", JSON.stringify(acct));
    let detailIban = acct.identification?.iban;
    let balances = acct.balances ?? [];
    const detailRes = await ebFetch(`/accounts/${acct.uid}`, appId, privKey);
    if (detailRes.ok) {
      const detail = await detailRes.json();
      console.log("[EB] account detail:", JSON.stringify(detail));
      detailIban ??= detail.identification?.iban;
      if (detail.balances?.length) balances = detail.balances;
    } else {
      console.warn("[EB] account detail fetch failed:", detailRes.status);
    }
    if (!balances.length) {
      const balRes = await ebFetch(`/accounts/${acct.uid}/balances`, appId, privKey);
      if (balRes.ok) {
        const balData = await balRes.json();
        balances = balData.balances ?? [];
        console.log("[EB] balances fetched separately:", JSON.stringify(balances));
      } else {
        console.warn("[EB] balance fetch failed:", balRes.status);
      }
    }
    const iban = detailIban ?? acct.uid;
    console.log("[EB] resolved iban:", iban);
    const txRes = await ebFetch(
      `/accounts/${acct.uid}/transactions?date_from=${dateFrom}&date_to=${dateTo}`,
      appId,
      privKey
    );
    if (!txRes.ok) {
      if ([401, 403, 410, 422].includes(txRes.status)) authFailures++;
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
    const closingBal = balances.find((b) => b.balance_type === "closingBooked") ?? balances[0];
    const isRealIban = /^[A-Z]{2}\d{2}/.test(iban);
    mappedAccounts.push({
      iban,
      blz: isRealIban ? iban.slice(4, 12) : "",
      accountNumber: isRealIban ? iban.slice(12) : iban,
      owner: acct.owner_name ?? "",
      description: acct.name && acct.name !== acct.owner_name ? acct.name : "Girokonto",
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
  if (accounts.length > 0 && mappedAccounts.length === 0 && authFailures === accounts.length) {
    throw new EbSessionExpiredError();
  }
  console.log("[EB] done: accounts=", mappedAccounts.length, "transactions=", mappedTransactions.length);
  return { accounts: mappedAccounts, transactions: mappedTransactions };
}
__name(ebFetchData, "ebFetchData");

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
var SOURCE_RANK = { csv: 1, eb: 2, creditcard: 3, traderepublic: 4 };
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
    parentId: r.parent_id,
    isin: r.isin,
    shares: r.shares
  };
}
__name(rowToStored, "rowToStored");
async function countRows(db) {
  const r = await db.prepare("SELECT COUNT(*) AS c FROM transactions").first();
  return r?.c ?? 0;
}
__name(countRows, "countRows");
async function getTradeRows(db) {
  const { results } = await db.prepare("SELECT date, isin, shares FROM transactions WHERE isin IS NOT NULL AND shares IS NOT NULL ORDER BY date ASC").all();
  return results ?? [];
}
__name(getTradeRows, "getTradeRows");
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
    parentId: r.parentId ?? null,
    isin: r.isin ?? null,
    shares: r.shares ?? null
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
  const freshRows = /* @__PURE__ */ new Set();
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
    freshRows.add(r);
  }
  const toInsert = toStored(toInsertRows, source);
  const newlyAddedIds = toInsert.filter((_, i) => freshRows.has(toInsertRows[i])).map((t) => t.id);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmts = [];
  for (const id of toDelete) {
    stmts.push(db.prepare("DELETE FROM transactions WHERE id = ?").bind(id));
  }
  for (const t of toInsert) {
    stmts.push(
      db.prepare(
        `INSERT INTO transactions
           (id, date, amount, type, description, counterparty, iban, account_iban, reference, category_id, custom_label, custom_icon, source, parent_id, isin, shares, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
        t.isin,
        t.shares,
        now
      )
    );
  }
  if (stmts.length) await db.batch(stmts);
  const total = await countRows(db);
  return { added: toInsert.length - toDelete.length, total, newlyAddedIds };
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
  if ("parentId" in patch) {
    fields.push("parent_id=?");
    vals.push(patch.parentId ?? null);
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
async function saveEbSession(db, entry) {
  await db.prepare(
    `INSERT INTO eb_session (id, session_id, accounts, valid_until, created_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       accounts = excluded.accounts,
       valid_until = excluded.valid_until,
       created_at = excluded.created_at`
  ).bind(entry.sessionId, entry.accountsJson, entry.validUntil, (/* @__PURE__ */ new Date()).toISOString()).run();
}
__name(saveEbSession, "saveEbSession");
async function getEbSession(db) {
  return await db.prepare("SELECT session_id, accounts, valid_until, created_at FROM eb_session WHERE id = 1").first();
}
__name(getEbSession, "getEbSession");
async function clearEbSession(db) {
  await db.prepare("DELETE FROM eb_session WHERE id = 1").run();
}
__name(clearEbSession, "clearEbSession");

// src/traderepublic/waf.ts
var AES_KEY_HEX = "6f71a512b1e035eaab53d8be73120d3fb68a0ca346b9560aab3e5cdf753d5e98";
var CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
var CHALLENGE_SOLVERS = {
  ha9faaffd31b4d5ede2a2e19d2d7fd525f66fee61911511960dcbb52d3c48ce25: "network_bandwidth",
  h7b0c470f0cfe3a80a9e26526ad185f484f6817d0832712a4a37a908786a6a67f: "hash_pow"
};
var DEFAULT_BANDWIDTH_SIZES = { 1: 1024, 2: 10 * 1024, 3: 100 * 1024, 4: 1048576, 5: 10 * 1048576 };
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
__name(hexToBytes, "hexToBytes");
function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
var CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = 4294967295;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
__name(crc32, "crc32");
async function aesGcmEncrypt(plaintext) {
  const key = await crypto.subtle.importKey("raw", hexToBytes(AES_KEY_HEX), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const combined = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const tag = combined.slice(-16);
  const ciphertext = combined.slice(0, -16);
  const ivB64 = btoa(String.fromCharCode(...iv));
  return `${ivB64}::${bytesToHex(tag)}::${bytesToHex(ciphertext)}`;
}
__name(aesGcmEncrypt, "aesGcmEncrypt");
var GPUS = JSON.parse(
  '[{"renderer":"ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)","vendor":"Google Inc. (Apple)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"},{"renderer":"ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)","vendor":"Google Inc. (AMD)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"},{"renderer":"ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)","vendor":"Google Inc. (Intel)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"},{"renderer":"ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)","vendor":"Google Inc. (Intel)","extensions":"ANGLE_instanced_arrays;EXT_blend_minmax;EXT_clip_control;EXT_color_buffer_half_float;EXT_depth_clamp;EXT_disjoint_timer_query;EXT_float_blend;EXT_frag_depth;EXT_polygon_offset_clamp;EXT_shader_texture_lod;EXT_texture_compression_bptc;EXT_texture_compression_rgtc;EXT_texture_filter_anisotropic;EXT_texture_mirror_clamp_to_edge;EXT_sRGB;KHR_parallel_shader_compile;OES_element_index_uint;OES_fbo_render_mipmap;OES_standard_derivatives;OES_texture_float;OES_texture_float_linear;OES_texture_half_float;OES_texture_half_float_linear;OES_vertex_array_object;WEBGL_blend_func_extended;WEBGL_color_buffer_float;WEBGL_compressed_texture_astc;WEBGL_compressed_texture_etc;WEBGL_compressed_texture_etc1;WEBGL_compressed_texture_pvrtc;WEBGL_compressed_texture_s3tc;WEBGL_compressed_texture_s3tc_srgb;WEBGL_debug_renderer_info;WEBGL_debug_shaders;WEBGL_depth_texture;WEBGL_draw_buffers;WEBGL_lose_context;WEBGL_multi_draw;WEBGL_polygon_mode"}]'
);
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}
__name(randInt, "randInt");
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}
__name(randFloat, "randFloat");
async function getFingerprint(userAgent) {
  const ts = Date.now();
  const gpu = GPUS[randInt(0, GPUS.length)];
  const bins = Array.from({ length: 256 }, () => randInt(0, 40));
  bins[0] = randInt(14473, 16573);
  bins[255] = randInt(14473, 16573);
  const fp = {
    metrics: {
      fp2: 1,
      browser: 0,
      capabilities: 1,
      gpu: 7,
      dnt: 0,
      math: 0,
      screen: 0,
      navigator: 0,
      auto: 1,
      stealth: 0,
      subtle: 0,
      canvas: 5,
      formdetector: 1,
      be: 0
    },
    start: ts,
    flashVersion: null,
    plugins: [
      { name: "PDF Viewer", str: "PDF Viewer " },
      { name: "Chrome PDF Viewer", str: "Chrome PDF Viewer " },
      { name: "Chromium PDF Viewer", str: "Chromium PDF Viewer " },
      { name: "Microsoft Edge PDF Viewer", str: "Microsoft Edge PDF Viewer " },
      { name: "WebKit built-in PDF", str: "WebKit built-in PDF " }
    ],
    dupedPlugins: "PDF Viewer Chrome PDF Viewer Chromium PDF Viewer Microsoft Edge PDF Viewer WebKit built-in PDF ||1920-1080-1032-24-*-*-*",
    screenInfo: "1920-1080-1032-24-*-*-*",
    referrer: "",
    userAgent,
    location: "",
    webDriver: false,
    capabilities: {
      css: { textShadow: 1, WebkitTextStroke: 1, boxShadow: 1, borderRadius: 1, borderImage: 1, opacity: 1, transform: 1, transition: 1 },
      js: { audio: true, geolocation: Math.random() < 0.5, localStorage: "supported", touch: false, video: true, webWorker: Math.random() < 0.5 },
      elapsed: 1
    },
    gpu: { vendor: gpu.vendor, model: gpu.renderer, extensions: gpu.extensions.split(";") },
    dnt: null,
    math: { tan: "-1.4214488238747245", sin: "0.8178819121159085", cos: "-0.5753861119575491" },
    automation: { wd: { properties: { document: [], window: [], navigator: [] } }, phantom: { properties: { window: [] } } },
    stealth: { t1: 0, t2: 0, i: 1, mte: 0, mtd: false },
    crypto: {
      crypto: 1,
      subtle: 1,
      encrypt: true,
      decrypt: true,
      wrapKey: true,
      unwrapKey: true,
      sign: true,
      verify: true,
      digest: true,
      deriveBits: true,
      deriveKey: true,
      getRandomValues: true,
      randomUUID: true
    },
    canvas: { hash: randInt(645172295, 735192295), emailHash: null, histogramBins: bins },
    formDetected: false,
    numForms: 0,
    numFormElements: 0,
    be: { si: false },
    end: ts + 1,
    errors: [],
    version: "2.4.0",
    id: crypto.randomUUID()
  };
  const payload = new TextEncoder().encode(JSON.stringify(fp));
  const crc = crc32(payload);
  const checksum = crc.toString(16).padStart(8, "0").toUpperCase();
  const checksumBytes = new TextEncoder().encode(checksum);
  const data = new Uint8Array(checksumBytes.length + 1 + payload.length);
  data.set(checksumBytes, 0);
  data[checksumBytes.length] = "#".charCodeAt(0);
  data.set(payload, checksumBytes.length + 1);
  return { checksum, encryptedFp: await aesGcmEncrypt(data) };
}
__name(getFingerprint, "getFingerprint");
async function hashPowSolve(challenge, salt, difficulty) {
  const prefix = challenge + salt;
  const full = Math.floor(difficulty / 8);
  const rem = difficulty % 8;
  for (let nonce = 0; ; nonce++) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prefix + nonce)));
    let ok = true;
    for (let i = 0; i < full; i++) if (digest[i] !== 0) {
      ok = false;
      break;
    }
    if (ok && rem && digest[full] >> 8 - rem) ok = false;
    if (ok) return String(nonce);
    if (nonce > 5e6) throw new Error("hash_pow: no solution found within iteration cap");
  }
}
__name(hashPowSolve, "hashPowSolve");
function networkBandwidthSolve(difficulty) {
  const size = DEFAULT_BANDWIDTH_SIZES[difficulty] ?? 1024;
  const zeros = new Uint8Array(size);
  let bin = "";
  const chunk = 32768;
  for (let i = 0; i < zeros.length; i += chunk) bin += String.fromCharCode(...zeros.subarray(i, i + chunk));
  return btoa(bin);
}
__name(networkBandwidthSolve, "networkBandwidthSolve");
async function solveTradeRepublicWaf() {
  const loginRes = await fetch("https://app.traderepublic.com/login", {
    headers: { "user-agent": CHROME_UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
  });
  const loginHtml = await loginRes.text();
  const challengeMatch = loginHtml.match(/src="(https:\/\/[^"]+\/challenge\.js)"/);
  if (!challengeMatch) throw new Error("WAF challenge.js URL not found in login page");
  const challengeJsUrl = challengeMatch[1];
  const wafEndpoint = challengeJsUrl.split("https://")[1].split("/challenge.js")[0];
  const inputsRes = await fetch(`https://${wafEndpoint}/inputs?client=browser`, {
    headers: { "user-agent": CHROME_UA, accept: "*/*" }
  });
  if (!inputsRes.ok) throw new Error(`WAF /inputs failed: HTTP ${inputsRes.status}`);
  const inputs = await inputsRes.json();
  const solverName = CHALLENGE_SOLVERS[inputs.challenge_type];
  if (!solverName) throw new Error(`Unsupported WAF challenge type: ${inputs.challenge_type}`);
  const { checksum, encryptedFp } = await getFingerprint(CHROME_UA);
  const solution = solverName === "network_bandwidth" ? networkBandwidthSolve(inputs.difficulty) : await hashPowSolve(inputs.challenge.input, checksum, inputs.difficulty);
  const payload = {
    challenge: inputs.challenge,
    checksum,
    solution,
    signals: [{ name: "Zoey", value: { Present: encryptedFp } }],
    existing_token: null,
    client: "Browser",
    domain: "app.traderepublic.com",
    metrics: [
      { name: "2", value: Math.random(), unit: "2" },
      { name: "100", value: 0, unit: "2" },
      { name: "101", value: 0, unit: "2" },
      { name: "102", value: 0, unit: "2" },
      { name: "103", value: 8, unit: "2" },
      { name: "104", value: 0, unit: "2" },
      { name: "105", value: 0, unit: "2" },
      { name: "106", value: 0, unit: "2" },
      { name: "107", value: 0, unit: "2" },
      { name: "108", value: 1, unit: "2" },
      { name: "undefined", value: 0, unit: "2" },
      { name: "110", value: 0, unit: "2" },
      { name: "111", value: 2, unit: "2" },
      { name: "112", value: 0, unit: "2" },
      { name: "undefined", value: 0, unit: "2" },
      { name: "3", value: 4, unit: "2" },
      { name: "7", value: 0, unit: "4" },
      { name: "1", value: randFloat(10, 20), unit: "2" },
      { name: "4", value: 36.5, unit: "2" },
      { name: "5", value: randFloat(0, 1), unit: "2" },
      { name: "6", value: randFloat(50, 60), unit: "2" },
      { name: "0", value: randFloat(130, 140), unit: "2" },
      { name: "8", value: 1, unit: "4" }
    ]
  };
  const verifyRes = await fetch(`https://${wafEndpoint}/verify`, {
    method: "POST",
    headers: { "user-agent": CHROME_UA, accept: "*/*", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload)
  });
  if (!verifyRes.ok) throw new Error(`WAF /verify failed: HTTP ${verifyRes.status}`);
  const verifyJson = await verifyRes.json();
  if (!verifyJson.token) throw new Error("WAF /verify response missing token");
  return verifyJson.token;
}
__name(solveTradeRepublicWaf, "solveTradeRepublicWaf");

// src/traderepublic/auth.ts
var TR_HOST = "https://api.traderepublic.com";
var TR_LOGIN_PATH = "/api/v2/auth/web/login";
var TR_APP_VERSION = "15.7.0";
var TR_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
function deviceInfoHeader(deviceId) {
  const payload = {
    stableDeviceId: deviceId,
    model: "Apple Macintosh",
    browser: "Chrome",
    browserVersion: "148.0.0.0",
    os: "Mac OS",
    osVersion: "10.15.7",
    timezone: "Europe/Amsterdam",
    timezoneOffset: -120,
    screen: "1800x1169x30",
    preferredLanguages: ["en", "en-US"],
    numberOfCores: 12,
    deviceMemory: 16
  };
  return btoa(JSON.stringify(payload));
}
__name(deviceInfoHeader, "deviceInfoHeader");
function authHeaders(wafToken, deviceId, cookies) {
  const h = {
    "User-Agent": TR_USER_AGENT,
    Origin: "https://app.traderepublic.com",
    Referer: "https://app.traderepublic.com/",
    "x-tr-platform": "web",
    "x-tr-app-version": TR_APP_VERSION,
    "x-tr-device-info": deviceInfoHeader(deviceId),
    "x-aws-waf-token": wafToken
  };
  if (cookies.length) h.Cookie = cookies.join("; ");
  return h;
}
__name(authHeaders, "authHeaders");
function extractSetCookies(headers) {
  const getSetCookie = headers.getSetCookie;
  const raw = getSetCookie ? getSetCookie.call(headers) : headers.get("set-cookie")?.split(/,(?=\s*\w+=)/) ?? [];
  return raw.map((c) => c.split(";")[0].trim()).filter(Boolean);
}
__name(extractSetCookies, "extractSetCookies");
function mergeCookies(existing, incoming) {
  const map = new Map(existing.map((c) => [c.split("=")[0], c]));
  for (const c of incoming) map.set(c.split("=")[0], c);
  return [...map.values()];
}
__name(mergeCookies, "mergeCookies");
async function startTrLogin(phoneNo, pin, wafToken) {
  const deviceId = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const res = await fetch(`${TR_HOST}${TR_LOGIN_PATH}`, {
    method: "POST",
    headers: { ...authHeaders(wafToken, deviceId, []), "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: phoneNo, pin })
  });
  const cookies = extractSetCookies(res.headers);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.processId) {
    throw new Error(body.errors ? JSON.stringify(body.errors) : `Login failed: HTTP ${res.status}`);
  }
  return { deviceId, wafToken, cookies, processId: body.processId };
}
__name(startTrLogin, "startTrLogin");
async function pollTrLogin(session) {
  const res = await fetch(`${TR_HOST}${TR_LOGIN_PATH}/processes/${session.processId}`, {
    headers: authHeaders(session.wafToken, session.deviceId, session.cookies)
  });
  const newCookies = extractSetCookies(res.headers);
  const merged = mergeCookies(session.cookies, newCookies);
  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
    return { status: "rejected", reason: `HTTP ${res.status}` };
  }
  if (!res.ok) return { status: "pending" };
  const body = await res.json().catch(() => ({}));
  const state = (body.state ?? body.status ?? "").toUpperCase();
  if (["APPROVED", "COMPLETED", "SUCCESS", "OK", "DONE"].includes(state)) {
    return { status: "approved", cookies: merged };
  }
  if (["REJECTED", "DECLINED", "FAILED", "EXPIRED"].includes(state)) {
    return { status: "rejected", reason: state };
  }
  if (merged.some((c) => c.startsWith("tr_session="))) {
    return { status: "approved", cookies: merged };
  }
  return { status: "pending" };
}
__name(pollTrLogin, "pollTrLogin");

// src/traderepublic/timeline.ts
var DEPOSIT_TYPES = /* @__PURE__ */ new Set([
  "ACCOUNT_TRANSFER_INCOMING",
  "INCOMING_TRANSFER",
  "INCOMING_TRANSFER_DELEGATION",
  "PAYMENT_INBOUND",
  "PAYMENT_INBOUND_APPLE_PAY",
  "PAYMENT_INBOUND_GOOGLE_PAY",
  "PAYMENT_INBOUND_SEPA_DIRECT_DEBIT",
  "PAYMENT_INBOUND_CREDIT_CARD",
  "PAYMENT-SERVICE-IN-PAYMENT-DIRECT-DEBIT",
  "card_refund",
  "card_successful_oct",
  "card_tr_refund"
]);
var REMOVAL_TYPES = /* @__PURE__ */ new Set([
  "OUTGOING_TRANSFER",
  "OUTGOING_TRANSFER_DELEGATION",
  "PAYMENT_OUTBOUND",
  "card_failed_transaction",
  "card_order_billed",
  "card_successful_atm_withdrawal",
  "card_successful_transaction",
  "junior_p2p_transfer"
]);
var DIVIDEND_TYPES = /* @__PURE__ */ new Set(["CREDIT"]);
var INTEREST_TYPES = /* @__PURE__ */ new Set(["INTEREST_PAYOUT", "INTEREST_PAYOUT_CREATED"]);
var TAX_REFUND_TYPES = /* @__PURE__ */ new Set(["TAX_CORRECTION", "TAX_REFUND", "ssp_tax_correction_invoice"]);
var TRADE_TYPES = /* @__PURE__ */ new Set([
  "IPO_TRADE_EXECUTED",
  "ORDER_EXECUTED",
  "SAVINGS_PLAN_EXECUTED",
  "SAVINGS_PLAN_INVOICE_CREATED",
  "TRADE_CORRECTED",
  "TRADE_INVOICE",
  "benefits_spare_change_execution",
  "trading_savingsplan_executed",
  "trading_trade_executed"
]);
var SAVEBACK_TYPES = /* @__PURE__ */ new Set(["ACQUISITION_TRADE_PERK", "benefits_saveback_execution"]);
var PRIVATE_MARKETS_TYPES = /* @__PURE__ */ new Set(["private_markets_order_created", "private_markets_trade_executed"]);
var IGNORED_TYPES = /* @__PURE__ */ new Set([
  "AML_SOURCE_OF_WEALTH_RESPONSE_EXECUTED",
  "CASH_ACCOUNT_CHANGED",
  "CREDIT_CANCELED",
  "CUSTOMER_CREATED",
  "CRYPTO_ANNUAL_STATEMENT",
  "CSX_CHAT_ACTIVITY",
  "DEVICE_RESET",
  "DOCUMENTS_ACCEPTED",
  "DOCUMENTS_CHANGED",
  "DOCUMENTS_CREATED",
  "EMAIL_VALIDATED",
  "EX_POST_COST_REPORT",
  "EX_POST_COST_REPORT_CREATED",
  "EXEMPTION_ORDER_CHANGE_REQUESTED",
  "EXEMPTION_ORDER_CHANGE_REQUESTED_AUTOMATICALLY",
  "EXEMPTION_ORDER_CHANGED",
  "INPAYMENTS_SEPA_MANDATE_CREATED",
  "INSTRUCTION_CORPORATE_ACTION",
  "JUNIOR_ONBOARDING_GUARDIAN_B_CONSENT",
  "GENERAL_MEETING",
  "GESH_CORPORATE_ACTION",
  "MATURITY",
  "ORDER_CANCELED",
  "ORDER_CREATED",
  "ORDER_EXPIRED",
  "ORDER_REJECTED",
  "PRE_DETERMINED_TAX_BASE_EARNING",
  "PUK_CREATED",
  "QUARTERLY_REPORT",
  "RDD_FLOW",
  "REFERENCE_ACCOUNT_CHANGED",
  "REFERRAL_FIRST_TRADE_EXECUTED_INVITEE",
  "SECURITIES_ACCOUNT_CREATED",
  "SHAREBOOKING",
  "SHAREBOOKING_TRANSACTIONAL",
  "STOCK_PERK_REFUNDED",
  "TAX_YEAR_END_REPORT",
  "TAX_YEAR_END_REPORT_CREATED",
  "VERIFICATION_TRANSFER_ACCEPTED",
  "YEAR_END_TAX_REPORT",
  "card_failed_verification",
  "card_successful_verification",
  "crypto_annual_statement",
  "current_account_activated",
  "new_tr_iban",
  "private_markets_suitability_quiz_completed",
  "ssp_general_meeting_customer_instruction",
  "ssp_tender_offer_customer_instruction",
  "trading_order_cancelled",
  "trading_order_created",
  "trading_order_expired",
  "trading_order_rejected",
  "trading_savingsplan_execution_failed",
  "ssp_capital_increase_customer_instruction",
  "ssp_corporate_action_informative_notification",
  "ssp_dividend_option_customer_instruction"
]);
function categoryForEventType(eventType, subtitle) {
  const t = eventType ?? "";
  if (IGNORED_TYPES.has(t)) return null;
  if (DEPOSIT_TYPES.has(t) || REMOVAL_TYPES.has(t)) return "transfer";
  if (DIVIDEND_TYPES.has(t) || INTEREST_TYPES.has(t) || TAX_REFUND_TYPES.has(t)) return "income";
  if (TRADE_TYPES.has(t) || SAVEBACK_TYPES.has(t) || PRIVATE_MARKETS_TYPES.has(t)) return "savings";
  if (subtitle === "Vorabpauschale") return "fees";
  if (subtitle === "Saveback") return "savings";
  return null;
}
__name(categoryForEventType, "categoryForEventType");
function extractIsin(icon) {
  const parts = icon?.split("/");
  return parts && parts.length >= 2 ? parts[1] : void 0;
}
__name(extractIsin, "extractIsin");
function mapEvent(item) {
  const categoryId = categoryForEventType(item.eventType, item.subtitle);
  if (!categoryId) return null;
  const amount = item.amount?.value;
  if (amount === void 0 || amount === null || amount === 0) return null;
  return {
    date: item.timestamp,
    amount,
    description: item.title,
    counterparty: item.subtitle || item.title,
    reference: item.eventType,
    categoryId,
    isin: TRADE_TYPES.has(item.eventType ?? "") ? extractIsin(item.icon) : void 0
  };
}
__name(mapEvent, "mapEvent");
function parseGermanNumber(text) {
  const cleaned = text.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? void 0 : n;
}
__name(parseGermanNumber, "parseGermanNumber");
function extractShares(detail) {
  for (const section of detail.sections ?? []) {
    if (section.type !== "table") continue;
    const txRow = section.data?.find((row) => row.title === "Transaktion");
    const nestedSections = txRow?.detail?.action?.payload?.sections;
    for (const nested of nestedSections ?? []) {
      if (nested.type !== "table") continue;
      const sharesRow = nested.data?.find((row) => row.title === "Aktien" || row.title === "Anteile");
      if (sharesRow?.detail?.text) {
        const n = parseGermanNumber(sharesRow.detail.text);
        if (n !== void 0) return n;
      }
    }
  }
  return void 0;
}
__name(extractShares, "extractShares");
var TrSocket = class {
  static {
    __name(this, "TrSocket");
  }
  ws;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  connected;
  constructor(ws) {
    this.ws = ws;
    this.connected = new Promise((resolve, reject) => {
      const onMessage = /* @__PURE__ */ __name((ev) => {
        const text = typeof ev.data === "string" ? ev.data : "";
        if (text === "connected") {
          this.ws.removeEventListener("message", onMessage);
          resolve();
        }
      }, "onMessage");
      this.ws.addEventListener("message", onMessage);
      this.ws.addEventListener("error", () => reject(new Error("WebSocket connect error")));
      this.ws.addEventListener("close", () => reject(new Error("WebSocket closed before connect")));
    });
    this.ws.addEventListener("message", (ev) => this.onMessage(ev));
  }
  onMessage(ev) {
    const text = typeof ev.data === "string" ? ev.data : "";
    if (!text || text === "connected") return;
    const spaceIdx = text.indexOf(" ");
    if (spaceIdx < 0) return;
    const id = text.slice(0, spaceIdx);
    const code = text[spaceIdx + 1];
    const payloadStr = text.slice(spaceIdx + 2).trimStart();
    const pending = this.pending.get(id);
    if (!pending) return;
    if (code === "A") {
      this.pending.delete(id);
      try {
        pending.resolve(payloadStr ? JSON.parse(payloadStr) : {});
      } catch (e) {
        pending.reject(e);
      }
    } else if (code === "E") {
      this.pending.delete(id);
      pending.reject(new Error(`TR subscription error: ${payloadStr.slice(0, 300)}`));
    }
  }
  async waitConnected() {
    await this.connected;
  }
  async subscribeOnce(payload, timeoutMs = 15e3) {
    const id = String(this.nextId++);
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("TR subscription timed out"));
        }
      }, timeoutMs);
    });
    this.ws.send(`sub ${id} ${JSON.stringify(payload)}`);
    try {
      return await result;
    } finally {
      this.ws.send(`unsub ${id}`);
    }
  }
  close() {
    this.ws.close();
  }
};
async function connectTrWebSocket(cookies) {
  const cookieHeader = cookies.join("; ");
  const resp = await fetch("https://api.traderepublic.com/", {
    headers: { Upgrade: "websocket", Cookie: cookieHeader }
  });
  const ws = resp.webSocket;
  if (!ws) throw new Error(`TR WebSocket upgrade failed (HTTP ${resp.status})`);
  ws.accept();
  const connectionMessage = {
    locale: "de",
    platformId: "webtrading",
    platformVersion: "chrome - 94.0.4606",
    clientId: "app.traderepublic.com",
    clientVersion: "5582"
  };
  ws.send(`connect 31 ${JSON.stringify(connectionMessage)}`);
  const socket = new TrSocket(ws);
  await socket.waitConnected();
  return socket;
}
__name(connectTrWebSocket, "connectTrWebSocket");
async function fetchAllPages(socket, type) {
  const all = [];
  let after = null;
  for (let page = 0; page < 200; page++) {
    const response = await socket.subscribeOnce({ type, after });
    if (!response.items?.length) break;
    all.push(...response.items);
    after = response.cursors?.after ?? null;
    if (!after) break;
  }
  return all;
}
__name(fetchAllPages, "fetchAllPages");
async function fetchTradeRepublicTransactions(cookies) {
  const socket = await connectTrWebSocket(cookies);
  try {
    const [transactions, activity] = await Promise.all([
      fetchAllPages(socket, "timelineTransactions"),
      fetchAllPages(socket, "timelineActivityLog")
    ]);
    const byId = /* @__PURE__ */ new Map();
    for (const item of [...transactions, ...activity]) byId.set(item.id, item);
    const mapped = [];
    await Promise.all([...byId.entries()].map(async ([id, item]) => {
      const tx = mapEvent(item);
      if (!tx) return;
      if (tx.isin) {
        try {
          const detail = await socket.subscribeOnce({ type: "timelineDetailV2", id });
          const shares = extractShares(detail);
          if (shares !== void 0) tx.shares = tx.amount < 0 ? shares : -shares;
        } catch {
        }
      }
      mapped.push(tx);
    }));
    return mapped;
  } finally {
    socket.close();
  }
}
__name(fetchTradeRepublicTransactions, "fetchTradeRepublicTransactions");

// src/traderepublic/marketdata.ts
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
var isinCache = /* @__PURE__ */ new Map();
async function resolveInstrument(isin, db) {
  if (isinCache.has(isin)) return isinCache.get(isin) ?? null;
  if (db) {
    const row = await db.prepare("SELECT symbol, name FROM instruments WHERE isin = ?").bind(isin).first().catch(() => null);
    if (row) {
      isinCache.set(isin, row);
      return row;
    }
  }
  const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}`, {
    headers: { "user-agent": UA }
  });
  if (!res.ok) {
    isinCache.set(isin, null);
    return null;
  }
  const data = await res.json();
  const quote = data.quotes?.[0];
  const resolved = quote?.symbol ? { symbol: quote.symbol, name: quote.shortname ?? quote.longname ?? quote.symbol } : null;
  isinCache.set(isin, resolved);
  if (resolved && db) {
    await db.prepare("INSERT OR REPLACE INTO instruments (isin, symbol, name, resolved_at) VALUES (?, ?, ?, ?)").bind(isin, resolved.symbol, resolved.name, (/* @__PURE__ */ new Date()).toISOString()).run().catch(() => {
    });
  }
  return resolved;
}
__name(resolveInstrument, "resolveInstrument");
var RANGE_PRESETS = [
  { days: 5, range: "5d" },
  { days: 30, range: "1mo" },
  { days: 90, range: "3mo" },
  { days: 180, range: "6mo" },
  { days: 365, range: "1y" },
  { days: 730, range: "2y" },
  { days: 1825, range: "5y" },
  { days: 3650, range: "10y" }
];
function rangeForDays(days) {
  return RANGE_PRESETS.find((p) => days <= p.days)?.range ?? "max";
}
__name(rangeForDays, "rangeForDays");
async function fetchHistoricalPrices(ticker, range) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://finants-cache.internal/yahoo/${encodeURIComponent(ticker)}/${range}`);
  const cached = await cache?.match(cacheKey);
  if (cached) return cached.json();
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`,
    { headers: { "user-agent": UA } }
  );
  if (!res.ok) throw new Error(`Yahoo chart fetch failed for ${ticker}: HTTP ${res.status}`);
  const data = await res.json();
  const result = data.chart.result?.[0];
  if (!result?.timestamp) return [];
  const closes = result.indicators.quote[0].close;
  const points = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = closes[i];
    if (close === null || close === void 0) continue;
    points.push({ date: new Date(result.timestamp[i] * 1e3).toISOString().slice(0, 10), close });
  }
  await cache?.put(cacheKey, new Response(JSON.stringify(points), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }
  })).catch(() => {
  });
  return points;
}
__name(fetchHistoricalPrices, "fetchHistoricalPrices");
async function fetchCurrentPrice(ticker) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
    { headers: { "user-agent": UA } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.chart.result?.[0]?.meta.regularMarketPrice ?? null;
}
__name(fetchCurrentPrice, "fetchCurrentPrice");

// src/traderepublic/portfolio.ts
async function fetchSecAccNo(session) {
  const res = await fetch(`${TR_HOST}/api/v2/auth/account`, {
    headers: authHeaders(session.wafToken, session.deviceId, session.cookies)
  });
  if (!res.ok) throw new Error(`TR account settings failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.securitiesAccountNumber) throw new Error("securitiesAccountNumber missing from account settings");
  return data.securitiesAccountNumber;
}
__name(fetchSecAccNo, "fetchSecAccNo");
function flattenPositions(res) {
  const out = [];
  for (const cat of res.categories ?? []) {
    for (const pos of cat.positions ?? []) {
      const isin = pos.isin ?? pos.instrumentId;
      if (isin) out.push({ isin, netSize: pos.netSize });
    }
  }
  return out;
}
__name(flattenPositions, "flattenPositions");
async function fetchTradeRepublicPortfolioValue(session, db) {
  const secAccNo = await fetchSecAccNo(session);
  const socket = await connectTrWebSocket(session.cookies);
  try {
    const [portfolioRes, cashRes] = await Promise.all([
      socket.subscribeOnce({ type: "compactPortfolioByType", secAccNo }),
      socket.subscribeOnce({ type: "cash" })
    ]);
    const cash = (cashRes ?? []).reduce((sum, c) => sum + (c.amount ?? 0), 0);
    const positions = flattenPositions(portfolioRes);
    const values = await Promise.all(positions.map(async (pos) => {
      const instrument = await resolveInstrument(pos.isin, db);
      if (!instrument) return 0;
      const price = await fetchCurrentPrice(instrument.symbol);
      if (price === null) return 0;
      return price * parseFloat(pos.netSize);
    }));
    const holdingsValue = values.reduce((sum, v) => sum + v, 0);
    return Math.round((cash + holdingsValue) * 100) / 100;
  } finally {
    socket.close();
  }
}
__name(fetchTradeRepublicPortfolioValue, "fetchTradeRepublicPortfolioValue");

// src/traderepublic/depotHistory.ts
async function computeDepotHistory(trades, days, db) {
  const byIsin = /* @__PURE__ */ new Map();
  for (const t of trades) {
    const arr = byIsin.get(t.isin) ?? [];
    arr.push(t);
    byIsin.set(t.isin, arr);
  }
  for (const arr of byIsin.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  const range = rangeForDays(days);
  const perStock = [];
  const cumulativeByDate = /* @__PURE__ */ new Map();
  for (const [isin, isinTrades] of byIsin) {
    const instrument = await resolveInstrument(isin, db);
    if (!instrument) continue;
    const prices = await fetchHistoricalPrices(instrument.symbol, range);
    if (prices.length === 0) continue;
    const points = [];
    let shares = 0;
    let tradeIdx = 0;
    for (const p of prices) {
      while (tradeIdx < isinTrades.length && isinTrades[tradeIdx].date <= p.date) {
        shares += isinTrades[tradeIdx].shares;
        tradeIdx++;
      }
      if (shares <= 1e-6) continue;
      const value = Math.round(shares * p.close * 100) / 100;
      points.push({ date: p.date, value });
      cumulativeByDate.set(p.date, (cumulativeByDate.get(p.date) ?? 0) + value);
    }
    if (points.length > 0) perStock.push({ isin, name: instrument.name, points });
  }
  const cumulative = [...cumulativeByDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
  return { cumulative, perStock };
}
__name(computeDepotHistory, "computeDepotHistory");

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
      if ("parentId" in body) patch.parentId = body.parentId;
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
        let ebAccounts;
        if (body.code) {
          const session = await ebExchangeCode(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, body.code);
          ebAccounts = session.accounts;
          if (env.DB) {
            await saveEbSession(env.DB, {
              sessionId: session.sessionId,
              accountsJson: JSON.stringify(session.accounts),
              validUntil: session.validUntil ?? new Date(Date.now() + 180 * 864e5).toISOString()
            });
          }
        } else {
          const stored = env.DB ? await getEbSession(env.DB) : null;
          if (!stored || new Date(stored.valid_until).getTime() <= Date.now()) {
            if (stored && env.DB) await clearEbSession(env.DB);
            return jsonResponse({ error: "Keine g\xFCltige Bank-Session", needsAuth: true }, 401, cors);
          }
          ebAccounts = JSON.parse(stored.accounts);
        }
        const result = await ebFetchData(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, ebAccounts, fromDate, toDate);
        if (env.DB) {
          const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
          for (const acct of result.accounts) {
            if (!uuidRe.test(acct.iban)) continue;
            const row = await env.DB.prepare(`SELECT account_iban FROM transactions
                        WHERE account_iban IS NOT NULL AND account_iban NOT LIKE '________-____-%'
                        GROUP BY account_iban ORDER BY COUNT(*) DESC LIMIT 1`).first();
            if (!row?.account_iban) continue;
            const real = row.account_iban;
            for (const t of result.transactions) {
              if (t.accountIban === acct.iban)
                t.accountIban = real;
            }
            acct.blz = real.slice(4, 12);
            acct.accountNumber = real.slice(12);
            acct.iban = real;
          }
        }
        return jsonResponse(await buildSyncResponse(env, result, "eb", fromDate, toDate), 200, cors);
      } catch (e) {
        if (e instanceof EbSessionExpiredError) {
          if (env.DB) await clearEbSession(env.DB);
          return jsonResponse({ error: "Bank-Session abgelaufen", needsAuth: true }, 401, cors);
        }
        return jsonResponse({ error: String(e) }, 502, cors);
      }
    }
    if (request.method === "POST" && path === "/tr/login/start") {
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const phoneNo = env.TR_PHONE_NO ?? body.phoneNo;
      const pin = env.TR_PIN ?? body.pin;
      if (!phoneNo || !pin) return jsonResponse({ error: "phoneNo und pin erforderlich (oder TR_PHONE_NO/TR_PIN als Secret setzen)" }, 400, cors);
      try {
        const wafToken = await solveTradeRepublicWaf();
        const session = await startTrLogin(phoneNo, pin, wafToken);
        return jsonResponse({ session }, 200, cors);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors);
      }
    }
    if (request.method === "POST" && path === "/tr/login/poll") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      if (!body.session) return jsonResponse({ error: "session erforderlich" }, 400, cors);
      try {
        const result = await pollTrLogin(body.session);
        return jsonResponse(result, 200, cors);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors);
      }
    }
    if (request.method === "POST" && path === "/tr/sync") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      if (!body.session?.cookies?.length) return jsonResponse({ error: "session erforderlich (aus dem Login-Schritt)" }, 400, cors);
      const TRADE_REPUBLIC_IBAN = "DE62100123454047536911";
      try {
        const [events, portfolioValue] = await Promise.all([
          fetchTradeRepublicTransactions(body.session.cookies),
          fetchTradeRepublicPortfolioValue(body.session, env.DB).catch((e) => {
            console.error("TR portfolio valuation failed:", e);
            return null;
          })
        ]);
        const rows = events.map((e) => ({
          date: e.date,
          amount: e.amount,
          description: e.description,
          counterparty: e.counterparty,
          reference: e.reference,
          categoryId: e.categoryId,
          accountIban: TRADE_REPUBLIC_IBAN,
          isin: e.isin,
          shares: e.shares
        }));
        const meta = await mergeTransactions(env.DB, rows, "traderepublic");
        const transactions = await getTransactions(env.DB);
        return jsonResponse({ transactions, meta, portfolioValue }, 200, cors);
      } catch (e) {
        return jsonResponse({ error: String(e) }, 502, cors);
      }
    }
    if (request.method === "GET" && path === "/tr/depot-history") {
      if (!env.DB) return jsonResponse({ error: "D1 not configured" }, 503, cors);
      const days = Math.max(1, Number(url.searchParams.get("days")) || 180);
      try {
        const trades = await getTradeRows(env.DB);
        const history = await computeDepotHistory(trades, days, env.DB);
        return jsonResponse(history, 200, cors);
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
  let newlyAddedIds;
  if (env.DB) {
    const meta = await mergeTransactions(env.DB, result.transactions, source);
    added = meta.added;
    total = meta.total;
    newlyAddedIds = meta.newlyAddedIds;
    transactions = await getTransactions(env.DB);
  } else {
    transactions = toStored(result.transactions, source);
    added = transactions.length;
    total = transactions.length;
    newlyAddedIds = transactions.map((t) => t.id);
  }
  return {
    accounts: result.accounts,
    transactions,
    meta: {
      accountCount: result.accounts.length,
      count: total,
      added,
      newlyAddedIds,
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
