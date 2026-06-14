var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/fints.ts
function esc(v) {
  return v.replace(/[?+:@']/g, (c) => `?${c}`);
}
__name(esc, "esc");
function unesc(v) {
  return v.replace(/\?(.)/g, "$1");
}
__name(unesc, "unesc");
function splitDE(s) {
  const r = [];
  let c = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "?" && i + 1 < s.length) {
      c += s[++i];
      i++;
      continue;
    }
    if (ch === "@") {
      const at2 = s.indexOf("@", i + 1);
      if (at2 > i) {
        const len = parseInt(s.slice(i + 1, at2));
        if (!isNaN(len)) {
          c += s.slice(i, at2 + 1 + len);
          i = at2 + 1 + len;
          continue;
        }
      }
    }
    if (ch === "+") {
      r.push(c);
      c = "";
      i++;
      continue;
    }
    c += ch;
    i++;
  }
  r.push(c);
  return r;
}
__name(splitDE, "splitDE");
function splitDEG(s) {
  const r = [];
  let c = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "?" && i + 1 < s.length) {
      c += s[++i];
      continue;
    }
    if (s[i] === ":") {
      r.push(c);
      c = "";
      continue;
    }
    c += s[i];
  }
  r.push(c);
  return r;
}
__name(splitDEG, "splitDEG");
function buildMessage(dialogId, msgNo, ...segs) {
  const footer = `HNHBS:${segs.length + 2}:1+${msgNo}'`;
  const body = segs.join("") + footer;
  const stub = `HNHBK:1:3+000000000000+300+${dialogId}+${msgNo}'`;
  const total = stub.length + body.length;
  return `HNHBK:1:3+${String(total).padStart(12, "0")}+300+${dialogId}+${msgNo}'${body}`;
}
__name(buildMessage, "buildMessage");
function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
__name(fmtDate, "fmtDate");
function fmtTime(d) {
  return d.toISOString().slice(11, 19).replace(/:/g, "");
}
__name(fmtTime, "fmtTime");
function parseGermanAmount(s) {
  return parseFloat(s.replace(",", ".")) || 0;
}
__name(parseGermanAmount, "parseGermanAmount");
function fintsDateToISO(s) {
  if (s.length < 8) return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
__name(fintsDateToISO, "fintsDateToISO");
async function httpPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: btoa(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} vom FinTS-Server`);
  const raw = await res.text();
  try {
    return atob(raw.replace(/[\r\n]/g, ""));
  } catch {
    return raw;
  }
}
__name(httpPost, "httpPost");
function parseResponse(text) {
  const segs = [];
  let cur = "", i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "@") {
      let ls = "";
      i++;
      while (i < text.length && text[i] !== "@") {
        ls += text[i++];
      }
      i++;
      const len = parseInt(ls);
      cur += `@${ls}@${text.slice(i, i + len)}`;
      i += len;
      continue;
    }
    if (c === "?" && i + 1 < text.length) {
      cur += "?" + text[++i];
      i++;
      continue;
    }
    if (c === "'") {
      cur = cur.trim();
      if (cur) {
        const ci = cur.indexOf(":");
        if (ci > 0) {
          const name = cur.slice(0, ci);
          const rest = cur.slice(ci + 1);
          const pi = rest.indexOf("+");
          const hdr = pi >= 0 ? rest.slice(0, pi) : rest;
          const hp = hdr.split(":");
          segs.push({
            name,
            version: parseInt(hp[1]) || 0,
            position: parseInt(hp[0]) || 0,
            fields: pi >= 0 ? splitDE(rest.slice(pi + 1)) : [],
            raw: cur
          });
        }
      }
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  return segs;
}
__name(parseResponse, "parseResponse");
function findSeg(segs, name) {
  return segs.find((s) => s.name === name);
}
__name(findSeg, "findSeg");
function findSegs(segs, name) {
  return segs.filter((s) => s.name === name);
}
__name(findSegs, "findSegs");
function getDialogId(segs) {
  return findSeg(segs, "HNHBK")?.fields[2] ?? "0";
}
__name(getDialogId, "getDialogId");
function assertNoError(segs) {
  for (const s of segs) {
    if (s.name !== "HIRMG" && s.name !== "HIRMS") continue;
    for (const f of s.fields) {
      const p = splitDEG(f);
      const code = parseInt(p[0] ?? "0");
      if (code >= 9e3) throw new Error(`FinTS ${code}: ${unesc(p[2] ?? String(code))}`);
    }
  }
}
__name(assertNoError, "assertNoError");
function extractBlobs(field) {
  const blobs = [];
  let i = 0;
  while (i < field.length) {
    if (field[i] !== "@") {
      i++;
      continue;
    }
    const le = field.indexOf("@", i + 1);
    if (le < 0) break;
    const len = parseInt(field.slice(i + 1, le));
    blobs.push(field.slice(le + 1, le + 1 + len));
    i = le + 1 + len;
  }
  return blobs;
}
__name(extractBlobs, "extractBlobs");
function mapAccountType(code) {
  const m = {
    "1": "giro",
    "2": "savings",
    "3": "savings",
    "4": "depot",
    "5": "loan",
    "97": "giro"
  };
  return m[code] ?? "other";
}
__name(mapAccountType, "mapAccountType");
function parseHIUPD(segs) {
  return findSegs(segs, "HIUPD").map((seg) => {
    const f = seg.fields;
    const conn = splitDEG(f[0] ?? "");
    return {
      iban: (conn[0] ?? "").replace(/\s/g, ""),
      blz: conn[2] ?? "",
      accountNumber: conn[3] ?? "",
      owner: unesc(f[4] ?? ""),
      description: unesc(f[5] ?? ""),
      type: mapAccountType(f[2] ?? ""),
      currency: f[3] ?? "EUR",
      balance: 0,
      balanceDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
    };
  }).filter((a) => !!a.iban);
}
__name(parseHIUPD, "parseHIUPD");
function parseHISAL(segs) {
  const map = /* @__PURE__ */ new Map();
  for (const seg of findSegs(segs, "HISAL")) {
    const f = seg.fields;
    const conn = splitDEG(f[0] ?? "");
    const iban = (conn[0] ?? "").replace(/\s/g, "");
    if (!iban) continue;
    const balParts = splitDEG(f[3] ?? "");
    const cd = balParts[0] ?? "C";
    const amount = parseGermanAmount(balParts[1] ?? "0");
    const date = fintsDateToISO(balParts[2] ?? "");
    map.set(iban, { balance: cd === "D" ? -amount : amount, date });
  }
  return map;
}
__name(parseHISAL, "parseHISAL");
function parseHITAN(segs) {
  const hitan = findSeg(segs, "HITAN");
  if (!hitan) return null;
  const f = hitan.fields;
  const orderRef = f[2] ?? "";
  const challengeRaw = f[3] ?? "";
  const hint = f[4] ? unesc(f[4]) : void 0;
  let imageBase64;
  const blobs = extractBlobs(challengeRaw);
  if (blobs.length > 0) {
    const bytes = Uint8Array.from(blobs[0], (c) => c.charCodeAt(0));
    imageBase64 = btoa(String.fromCharCode(...bytes));
  }
  let method = "other";
  if (imageBase64) method = "photoTAN";
  else if (hint?.toLowerCase().includes("push")) method = "pushTAN";
  else if (challengeRaw && !blobs.length) method = "smsTAN";
  return { method, imageBase64, hint, orderRef };
}
__name(parseHITAN, "parseHITAN");
function parseMT940(data, defaultAccountIban) {
  const txs = [];
  const lines = data.split(/\r?\n/);
  let accountIban = defaultAccountIban;
  let closingBalance = null;
  let closingDate = null;
  let currency = "EUR";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith(":25:")) {
      const raw = line.slice(4).split("/")[0].replace(/\s/g, "");
      if (raw.length >= 15) accountIban = raw;
      i++;
      continue;
    }
    if (line.startsWith(":62F:") || line.startsWith(":62M:")) {
      const m = line.slice(5).match(/^([CD])(\d{6})([A-Z]{3})(\d+),(\d*)/);
      if (m) {
        const [, cd, yymmdd, cur, intPart, decPart] = m;
        const yy = parseInt(yymmdd.slice(0, 2));
        const fullYear = yy + (yy >= 70 ? 1900 : 2e3);
        closingDate = `${fullYear}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
        currency = cur;
        const amt = parseFloat(`${intPart}.${decPart || "00"}`);
        closingBalance = cd === "D" ? -amt : amt;
      }
      i++;
      continue;
    }
    if (line.startsWith(":61:")) {
      const m = line.slice(4).match(/^(\d{2})(\d{2})(\d{2})(\d{4})?([CD])R?[A-Z]{0,3}(\d+),(\d*)/);
      if (!m) {
        i++;
        continue;
      }
      const [, yy, mm, dd, , cd, intPart, decPart] = m;
      const year = parseInt(yy) + (parseInt(yy) > 50 ? 1900 : 2e3);
      const isoDate = `${year}-${mm}-${dd}`;
      const amount = (cd === "D" ? -1 : 1) * parseFloat(`${intPart}.${decPart || "00"}`);
      let desc86 = "";
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j].trim();
        if (next.startsWith(":86:")) {
          desc86 += next.slice(4);
          j++;
          while (j < lines.length && !lines[j].startsWith(":")) {
            desc86 += lines[j].trim();
            j++;
          }
          break;
        }
        if (next.match(/^:\d{2}[A-Z]?:/)) break;
        j++;
      }
      const sub = {};
      const re = /\?(\d{2})([^?]*)/g;
      let sm;
      while ((sm = re.exec(desc86)) !== null) sub[sm[1]] = sm[2];
      let description = "", counterparty = "", counterpartyIban = "";
      if (Object.keys(sub).length > 0) {
        description = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29].map((n) => sub[String(n).padStart(2, "0")] ?? "").join("").trim();
        counterpartyIban = (sub["31"] ?? "").trim();
        counterparty = [sub["32"] ?? "", sub["33"] ?? ""].join(" ").trim();
      } else {
        description = desc86.slice(3).trim();
      }
      txs.push({ date: isoDate, amount, description, counterparty, counterpartyIban, accountIban });
      i = j;
      continue;
    }
    i++;
  }
  return { transactions: txs, iban: accountIban, closingBalance, closingDate, currency };
}
__name(parseMT940, "parseMT940");
var DEFAULT_URL = "https://fints.commerzbank.de/fints";
function buildSecHdr(pos, secFun, secRef, blz, name) {
  const now = /* @__PURE__ */ new Date();
  return `HNSHK:${pos}:4+998:1+${secFun}+${secRef}+1+1+1:${fmtDate(now)}:${fmtTime(now)}+999:999:1+6:10:16+280:${blz}:${esc(name)}:V:0:0'`;
}
__name(buildSecHdr, "buildSecHdr");
function buildSecFtr(pos, secRef, pin, tan) {
  return `HNSHA:${pos}:2+${secRef}++${esc(pin)}${tan ? ":" + esc(tan) : ""}'`;
}
__name(buildSecFtr, "buildSecFtr");
function buildPinTanMessage(dialogId, msgNo, blz, name, secRef, pin, secFun, tan, ...customerSegs) {
  const secRefStr = String(secRef);
  const inner = [
    buildSecHdr(998, secFun, secRefStr, blz, name),
    ...customerSegs,
    buildSecFtr(999, secRefStr, pin, tan)
  ].join("");
  const now = /* @__PURE__ */ new Date();
  const iv = "\0".repeat(8);
  const hnvsk = `HNVSK:998:3+998:1+1+1::0+1:${fmtDate(now)}:${fmtTime(now)}+2:2:13:@8@${iv}:5:1+280:${blz}:${esc(name)}:V:0:0'`;
  const hnvsd = `HNVSD:999:1+@${inner.length}@${inner}'`;
  const hnvse = `HNVSE:1000:1+1'`;
  const hnhbs = `HNHBS:1001:1+${msgNo}'`;
  const body = hnvsk + hnvsd + hnvse + hnhbs;
  const stub = `HNHBK:1:3+000000000000+300+${dialogId}+${msgNo}'`;
  const total = stub.length + body.length;
  return `HNHBK:1:3+${String(total).padStart(12, "0")}+300+${dialogId}+${msgNo}'${body}`;
}
__name(buildPinTanMessage, "buildPinTanMessage");
async function syncAll(cfg, fromDate, toDate, tan, pendingDialogId, pendingSecRef, secFun) {
  const url = cfg.url ?? DEFAULT_URL;
  const blz = cfg.blz;
  const name = cfg.username;
  let resolvedSecFun = secFun ?? "900";
  if (!secFun && !pendingDialogId) {
    try {
      const anonMsg = buildMessage(
        "0",
        1,
        `HKIDN:2:2+280:${blz}+anonymous+0+0'`,
        `HKVVB:3:3+0+0+0+FinAnts+1.0'`
      );
      const anonResp = await httpPost(url, anonMsg);
      console.log("[FinTS] anon raw response len:", anonResp.length, "| preview:", JSON.stringify(anonResp.slice(0, 120)));
      const anonSegs = parseResponse(anonResp);
      const anonId = getDialogId(anonSegs);
      console.log("[FinTS] anon dialog segments:", anonSegs.map((s) => s.name).join(" "));
      const hipins = findSeg(anonSegs, "HIPINS");
      if (hipins) {
        for (let f = 4; f < hipins.fields.length; f++) {
          const p = splitDEG(hipins.fields[f]);
          const c = parseInt(p[0] ?? "0");
          if (!isNaN(c) && c >= 900 && c < 999) {
            resolvedSecFun = String(c);
            break;
          }
        }
      }
      console.log("[FinTS] secFun resolved:", resolvedSecFun, hipins ? "(from HIPINS)" : "(default 900)");
      if (anonId !== "0") {
        await httpPost(url, buildMessage(anonId, 2, `HKEND:2:1+${anonId}'`)).catch(() => {
        });
      }
    } catch (e) {
      console.warn("[FinTS] anon dialog failed (non-fatal):", String(e));
    }
  }
  const fromStr = fmtDate(fromDate);
  const toStr = fmtDate(toDate);
  let secRef = pendingSecRef ? pendingSecRef + 1 : 1;
  let dialogId = pendingDialogId ?? "0";
  let initSegs2 = [];
  if (!pendingDialogId) {
    console.log("[FinTS] dialog-init \u2192 secFun:", resolvedSecFun);
    const initMsg = buildPinTanMessage(
      "0",
      1,
      blz,
      name,
      secRef,
      cfg.pin,
      resolvedSecFun,
      void 0,
      `HKIDN:1:2+280:${blz}+${esc(name)}+0+0'`,
      `HKVVB:2:3+0+0+0+FinAnts+1.0'`
    );
    console.log("[FinTS] init message preview:", initMsg.slice(0, 400));
    const initResp = await httpPost(url, initMsg);
    initSegs2 = parseResponse(initResp);
    console.log("[FinTS] init segments:", initSegs2.map((s) => `${s.name}:${s.version}`).join(" "));
    for (const s of initSegs2.filter((s2) => s2.name === "HIRMG" || s2.name === "HIRMS")) {
      console.log(`[FinTS] init ${s.name} raw:`, JSON.stringify(s.fields));
      for (const f of s.fields) {
        const p = splitDEG(f);
        console.log(`[FinTS] init ${s.name} code ${p[0]}: ${unesc(p[2] ?? "")}`);
      }
    }
    assertNoError(initSegs2);
    dialogId = getDialogId(initSegs2);
    secRef++;
    console.log("[FinTS] dialog opened, id:", dialogId);
  }
  console.log("[FinTS] jobs \u2192 secFun:", resolvedSecFun, "from:", fromStr, "to:", toStr);
  const jobMsg = buildPinTanMessage(
    dialogId,
    2,
    blz,
    name,
    secRef,
    cfg.pin,
    resolvedSecFun,
    tan,
    `HKSAL:1:7+::0+J'`,
    `HKKAZ:2:7+::0+J+${fromStr}+${toStr}++'`
  );
  let jobResp;
  try {
    jobResp = await httpPost(url, jobMsg);
  } catch (e) {
    console.error("[FinTS] jobs httpPost threw:", String(e));
    throw e;
  }
  console.log("[FinTS] jobs raw response len:", jobResp.length, "| preview:", JSON.stringify(jobResp.slice(0, 120)));
  const jobSegs = parseResponse(jobResp);
  console.log("[FinTS] jobs segments:", jobSegs.map((s) => `${s.name}:${s.version}`).join(" "));
  for (const s of jobSegs.filter((s2) => s2.name === "HIRMG" || s2.name === "HIRMS")) {
    for (const f of s.fields) {
      const p = splitDEG(f);
      console.log(`[FinTS] jobs ${s.name} code ${p[0]}: ${unesc(p[2] ?? "")}`);
    }
  }
  const challengeData = parseHITAN(jobSegs);
  console.log("[FinTS] HITAN found:", !!challengeData, challengeData ? `method=${challengeData.method}` : "");
  if (challengeData && !tan) {
    return {
      accounts: [],
      transactions: [],
      challenge: {
        ...challengeData,
        dialogId,
        secRef,
        secFun: resolvedSecFun
      }
    };
  }
  assertNoError(jobSegs);
  secRef++;
  const accountPartials = parseHIUPD([...initSegs2, ...jobSegs]);
  const balances = parseHISAL(jobSegs);
  console.log("[FinTS] HIUPD accounts:", accountPartials.length, "| HISAL entries:", balances.size);
  const allTxs = [];
  const mt940Balances = /* @__PURE__ */ new Map();
  for (const seg of findSegs(jobSegs, "HIKAZ")) {
    const segIban = (splitDEG(seg.fields[0] ?? "")[0] ?? "").replace(/\s/g, "");
    for (const field of seg.fields) {
      for (const blob of extractBlobs(field)) {
        const result = parseMT940(blob, segIban);
        allTxs.push(...result.transactions);
        if (result.closingBalance !== null && result.iban) {
          mt940Balances.set(result.iban, {
            balance: result.closingBalance,
            date: result.closingDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
            currency: result.currency
          });
        }
      }
    }
  }
  let accounts;
  if (accountPartials.length > 0) {
    accounts = accountPartials.map((a) => {
      const hisal = balances.get(a.iban ?? "");
      const mt940 = mt940Balances.get(a.iban ?? "");
      const bal = hisal ?? (mt940 ? { balance: mt940.balance, date: mt940.date } : { balance: 0, date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) });
      return {
        iban: a.iban ?? "",
        blz: a.blz ?? "",
        accountNumber: a.accountNumber ?? "",
        owner: a.owner ?? "",
        description: a.description ?? "",
        type: a.type ?? "other",
        currency: mt940?.currency ?? a.currency ?? "EUR",
        balance: bal.balance,
        balanceDate: bal.date
      };
    });
  } else {
    accounts = Array.from(mt940Balances.entries()).map(([iban, bal]) => ({
      iban,
      blz,
      accountNumber: "",
      owner: name,
      description: "",
      type: "giro",
      currency: bal.currency,
      balance: bal.balance,
      balanceDate: bal.date
    }));
  }
  console.log("[FinTS] result: accounts:", accounts.length, "transactions:", allTxs.length);
  if (dialogId !== "0") {
    await httpPost(url, buildPinTanMessage(
      dialogId,
      3,
      blz,
      name,
      secRef,
      cfg.pin,
      resolvedSecFun,
      void 0,
      `HKEND:1:1+${dialogId}'`
    )).catch(() => {
    });
  }
  return { accounts, transactions: allTxs };
}
__name(syncAll, "syncAll");
function blzFromIban(iban) {
  const c = iban.replace(/\s/g, "").toUpperCase();
  if (!c.startsWith("DE") || c.length < 12) throw new Error("Ung\xFCltige deutsche IBAN");
  return c.slice(4, 12);
}
__name(blzFromIban, "blzFromIban");

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
      console.log("[EB] fetching next page, continuation_key:", continuationKey.slice(0, 40) + "...");
      const pageRes = await ebFetch(
        `/accounts/${acct.uid}/transactions?continuation_key=${encodeURIComponent(continuationKey)}`,
        appId,
        privKey
      );
      if (!pageRes.ok) break;
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
      const amount = parseFloat(tx.transaction_amount.amount);
      const isExpense = tx.credit_debit_indicator === "DBIT" || amount < 0;
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

// src/index.ts
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
__name(jsonResponse, "jsonResponse");
function checkAuth(request, env) {
  const key = request.headers.get("X-Api-Key") ?? new URL(request.url).searchParams.get("key");
  return !!env.API_KEY && key === env.API_KEY;
}
__name(checkAuth, "checkAuth");
function resolveBlz(env) {
  if (env.FINTS_BLZ) return env.FINTS_BLZ;
  if (env.FINTS_IBAN) return blzFromIban(env.FINTS_IBAN);
  throw new Error("FINTS_BLZ must be set as a Worker Secret");
}
__name(resolveBlz, "resolveBlz");
function formatError(e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("9010") || msg.includes("9210")) return msg + " (Falsche Zugangsdaten?)";
  if (msg.includes("9340")) return msg + " (Konto gesperrt oder Limit erreicht)";
  if (msg.includes("9800")) return msg + " (Bankserver vor\xFCbergehend nicht erreichbar)";
  return msg;
}
__name(formatError, "formatError");
var index_default = {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN ?? "*";
    const cors = corsHeaders(origin);
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
    if (!checkAuth(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, 401, cors);
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
        const result = await ebStartAuth(env.EB_APPLICATION_ID, env.EB_PRIVATE_KEY, body.redirect_url, body.aspsp_name ?? "Commerzbank AG", body.aspsp_country ?? "DE");
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
        return jsonResponse(buildSuccessBody(result, fromDate, toDate), 200, cors);
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
    let blz;
    try {
      blz = resolveBlz(env);
    } catch (e) {
      return jsonResponse({ error: String(e) }, 400, cors);
    }
    const cfg = { blz, username: env.FINTS_USERNAME, pin: env.FINTS_PIN };
    const isSync = request.method === "GET" && (path === "" || path.endsWith("/sync"));
    if (isSync) {
      const daysBack = Math.min(parseInt(url.searchParams.get("days") ?? "90"), 365);
      const toDate = /* @__PURE__ */ new Date();
      const fromDate = new Date(toDate.getTime() - daysBack * 864e5);
      try {
        const result = await syncAll(cfg, fromDate, toDate);
        if (result.challenge) {
          return jsonResponse({ challenge: result.challenge }, 202, cors);
        }
        return jsonResponse(buildSuccessBody(result, fromDate, toDate), 200, cors);
      } catch (e) {
        console.error("FinTS sync error:", e);
        return jsonResponse({ error: formatError(e) }, 502, cors);
      }
    }
    if (request.method === "POST" && path.endsWith("/tan")) {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Ung\xFCltiger JSON-Body" }, 400, cors);
      }
      const { tan, dialogId, secRef, secFun, days = 90 } = body;
      if (!tan || !dialogId || !secRef || !secFun) {
        return jsonResponse({ error: "Fehlende Felder: tan, dialogId, secRef, secFun" }, 400, cors);
      }
      const daysBack = Math.min(days, 365);
      const toDate = /* @__PURE__ */ new Date();
      const fromDate = new Date(toDate.getTime() - daysBack * 864e5);
      try {
        const result = await syncAll(cfg, fromDate, toDate, tan, dialogId, secRef, secFun);
        if (result.challenge) {
          return jsonResponse({ challenge: result.challenge }, 202, cors);
        }
        return jsonResponse(buildSuccessBody(result, fromDate, toDate), 200, cors);
      } catch (e) {
        console.error("FinTS TAN error:", e);
        return jsonResponse({ error: formatError(e) }, 502, cors);
      }
    }
    return jsonResponse({ error: "Not found" }, 404, cors);
  }
};
function buildSuccessBody(result, fromDate, toDate) {
  return {
    accounts: result.accounts,
    transactions: result.transactions,
    meta: {
      accountCount: result.accounts.length,
      count: result.transactions.length,
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
__name(buildSuccessBody, "buildSuccessBody");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
