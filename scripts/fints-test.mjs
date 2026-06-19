/**
 * Standalone FinTS 3.0 connectivity test — NOT wired into the app or worker.
 * Run this once to confirm new bank credentials actually authenticate before
 * spending time wiring FinTS back into the worker.
 *
 * Usage (PIN never touches shell history or git):
 *   1. cp .env.fints.local.example .env.fints.local
 *   2. fill in .env.fints.local (gitignored via the *.local glob)
 *   3. node --env-file=.env.fints.local scripts/fints-test.mjs
 *
 * Ported from worker/src/fints.ts (git show ef0dd13:worker/src/fints.ts),
 * which was removed when the app switched to PSD2/EnableBanking.
 */

// ─── Encoding helpers ────────────────────────────────────────────────────────

function esc(v) {
  return v.replace(/[?+:@']/g, c => `?${c}`)
}

function splitDEG(s) {
  const result = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '?' && i + 1 < s.length) { cur += s[++i]; continue }
    if (s[i] === ':') { result.push(cur); cur = ''; continue }
    cur += s[i]
  }
  result.push(cur)
  return result
}

function splitDE(s) {
  const result = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '?' && i + 1 < s.length) { cur += s[++i]; continue }
    if (s[i] === '+') { result.push(cur); cur = ''; continue }
    cur += s[i]
  }
  result.push(cur)
  return result
}

// ─── Message building ─────────────────────────────────────────────────────────

function buildMessage(dialogId, msgNo, ...segs) {
  const footer = `HNHBS:${segs.length + 2}:1+${msgNo}'`
  const body = segs.join('') + footer
  const stub = `HNHBK:1:3+000000000000+300+${dialogId}+${msgNo}'`
  const total = stub.length + body.length
  const header = `HNHBK:1:3+${String(total).padStart(12, '0')}+300+${dialogId}+${msgNo}'`
  return header + body
}

function fmtDate(d) { return d.toISOString().slice(0, 10).replace(/-/g, '') }
function fmtTime(d) { return d.toISOString().slice(11, 19).replace(/:/g, '') }

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function httpPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new TextEncoder().encode(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from FinTS server`)
  const buf = await res.arrayBuffer()
  return new TextDecoder('iso-8859-1').decode(buf)
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseResponse(text) {
  const segs = []
  let cur = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '@') {
      let lenStr = ''
      i++
      while (i < text.length && text[i] !== '@') { lenStr += text[i++] }
      i++
      const len = parseInt(lenStr)
      cur += `@${lenStr}@${text.slice(i, i + len)}`
      i += len
      continue
    }
    if (c === '?' && i + 1 < text.length) { cur += '?' + text[++i]; i++; continue }
    if (c === "'") {
      cur = cur.trim()
      if (cur) {
        const colonIdx = cur.indexOf(':')
        if (colonIdx > 0) {
          const name = cur.slice(0, colonIdx)
          const rest = cur.slice(colonIdx + 1)
          const plusIdx = rest.indexOf('+')
          const header = plusIdx >= 0 ? rest.slice(0, plusIdx) : rest
          const headerParts = header.split(':')
          const position = parseInt(headerParts[0]) || 0
          const version = parseInt(headerParts[1]) || 0
          const fields = plusIdx >= 0 ? splitDE(rest.slice(plusIdx + 1)) : []
          segs.push({ name, version, position, fields, raw: cur })
        }
      }
      cur = ''
      i++
      continue
    }
    cur += c
    i++
  }
  return segs
}

function findSeg(segs, name) { return segs.find(s => s.name === name) }
function findSegs(segs, name) { return segs.filter(s => s.name === name) }

function getDialogId(segs) {
  const h = findSeg(segs, 'HNHBK')
  return h?.fields[2] ?? '0'
}

/** Collects HIRMG/HIRMS return codes instead of throwing, so we can report
 * exactly what the bank said (e.g. wrong PIN, TAN required) either way. */
function collectReturnCodes(segs) {
  const codes = []
  for (const seg of segs) {
    if (seg.name !== 'HIRMG' && seg.name !== 'HIRMS') continue
    for (const field of seg.fields) {
      const parts = splitDEG(field)
      const code = parseInt(parts[0] ?? '0')
      if (!isNaN(code)) codes.push({ code, text: parts[2] ? parts[2].replace(/\?(.)/g, '$1') : '' })
    }
  }
  return codes
}

function extractBlobs(field) {
  const blobs = []
  let i = 0
  while (i < field.length) {
    if (field[i] === '@') {
      const lenEnd = field.indexOf('@', i + 1)
      if (lenEnd < 0) break
      const len = parseInt(field.slice(i + 1, lenEnd))
      blobs.push(field.slice(lenEnd + 1, lenEnd + 1 + len))
      i = lenEnd + 1 + len
    } else i++
  }
  return blobs
}

// ─── Main test ────────────────────────────────────────────────────────────────

const BLZ      = process.env.FINTS_BLZ
const USERNAME = process.env.FINTS_USERNAME
const PIN      = process.env.FINTS_PIN
const IBAN     = process.env.FINTS_IBAN ?? ''
const URL      = process.env.FINTS_URL ?? 'https://fints.commerzbank.de/fints'

if (!BLZ || !USERNAME || !PIN) {
  console.error('Missing FINTS_BLZ / FINTS_USERNAME / FINTS_PIN — see .env.fints.local.example')
  process.exit(1)
}

console.log(`→ FinTS test against ${URL}`)
console.log(`  BLZ=${BLZ} username=${USERNAME} (PIN not shown)`)

let secFun = '999'

try {
  console.log('\n[1/2] Anonymous dialog (discover security procedure)…')
  const anonMsg = buildMessage('0', 1,
    `HKIDN:2:2+280:${BLZ}+anonymous+0+0'`,
    `HKVVB:3:3+0+0+0+FinAnts+1.0'`,
    `HKSYN:4:3+0'`,
  )
  const anonResp = await httpPost(URL, anonMsg)
  const anonSegs = parseResponse(anonResp)
  const anonDialogId = getDialogId(anonSegs)
  console.log(`  ← got reply, dialogId=${anonDialogId}, ${anonSegs.length} segments`)
  for (const { code, text } of collectReturnCodes(anonSegs)) {
    console.log(`  · return code ${code}${text ? `: ${text}` : ''}`)
  }

  const hipins = findSeg(anonSegs, 'HIPINS')
  if (hipins) {
    for (let f = 4; f < hipins.fields.length; f++) {
      const parts = splitDEG(hipins.fields[f])
      const code = parseInt(parts[0] ?? '0')
      if (!isNaN(code) && code >= 900 && code <= 999) { secFun = String(code); break }
    }
  }
  console.log(`  using security procedure ${secFun}`)

  if (anonDialogId !== '0') {
    await httpPost(URL, buildMessage(anonDialogId, 2, `HKEND:2:1+${anonDialogId}'`)).catch(() => {})
  }
} catch (e) {
  console.log(`  (anonymous dialog failed, non-fatal: ${e.message})`)
}

console.log('\n[2/2] Authenticated dialog with your PIN + account statement request…')
const now = new Date()
const from = new Date(now.getTime() - 30 * 86_400_000)
const dateStr = fmtDate(now)
const timeStr = fmtTime(now)
const ibanField = IBAN ? esc(IBAN) : ''
const secRef = '1'

const authMsg = buildMessage('0', 1,
  `HNSHK:2:4+998+${secFun}+${secRef}+1+1+1::0+1+1:${dateStr}:${timeStr}+1:999:1+1:999:1+280:${BLZ}+${esc(USERNAME)}+J'`,
  `HKIDN:3:2+280:${BLZ}+${esc(USERNAME)}+0+1'`,
  `HKVVB:4:3+0+0+0+FinAnts+1.0'`,
  `HKTAN:5:6+${secFun}+J'`,
  `HKKAZ:6:7+${ibanField}+DE+${fmtDate(from)}+${fmtDate(now)}+N'`,
  `HNSHA:7:2+${secRef}++${esc(PIN)}'`,
)

try {
  const authResp = await httpPost(URL, authMsg)
  const authSegs = parseResponse(authResp)
  const authDialogId = getDialogId(authSegs)
  console.log(`  ← got reply, dialogId=${authDialogId}, ${authSegs.length} segments`)

  const codes = collectReturnCodes(authSegs)
  for (const { code, text } of codes) {
    const tag = code >= 9000 ? 'ERROR' : code >= 3000 ? 'warn ' : 'ok   '
    console.log(`  · [${tag}] ${code}${text ? `: ${text}` : ''}`)
  }

  const hardError = codes.find(c => c.code >= 9000)
  if (hardError) {
    console.log(`\n✗ Bank rejected the request — code ${hardError.code}: ${hardError.text}`)
    console.log('  (9942 = wrong PIN, 9930 = account unknown, 9050x = TAN/procedure needed — check the text above)')
  } else {
    const allTxs = []
    for (const seg of findSegs(authSegs, 'HIKAZ')) {
      for (const field of seg.fields) for (const blob of extractBlobs(field)) allTxs.push(blob)
    }
    console.log(`\n✓ Authenticated successfully. ${allTxs.length} MT940 blob(s) returned (raw, unparsed).`)
    console.log('  Credentials work — safe to proceed with wiring FinTS back into the worker if you want.')
  }

  if (authDialogId !== '0') {
    const secRef2 = '2'
    const now2 = new Date()
    const endMsg = buildMessage(authDialogId, 2,
      `HNSHK:2:4+998+${secFun}+${secRef2}+1+1+1::0+1+1:${fmtDate(now2)}:${fmtTime(now2)}+1:999:1+1:999:1+280:${BLZ}+${esc(USERNAME)}+J'`,
      `HKEND:3:1+${authDialogId}'`,
      `HNSHA:4:2+${secRef2}++${esc(PIN)}'`,
    )
    await httpPost(URL, endMsg).catch(() => {})
  }
} catch (e) {
  console.log(`\n✗ Request failed: ${e.message}`)
}
