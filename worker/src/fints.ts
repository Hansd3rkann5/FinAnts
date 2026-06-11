/**
 * Minimal FinTS 3.0 / HBCI client for Cloudflare Workers.
 * Implements only what is needed: read account statements via PIN (no TAN required
 * for Kontoinformationen with Einschritt-PIN/TAN-Verfahren).
 *
 * Reference: FinTS 3.0 Formals + Security_Sicherheitsverfahren_PINTAN spec.
 */

// ─── Encoding helpers ────────────────────────────────────────────────────────

/** Escape special FinTS characters inside a data value. */
function esc(v: string): string {
  return v.replace(/[?+:@']/g, c => `?${c}`)
}

/** Unescape a FinTS data value. */
function unesc(v: string): string {
  return v.replace(/\?(.)/g, '$1')
}

/**
 * Split a FinTS data element group string (DEG) by unescaped ':'.
 * e.g. "280:20041100" → ["280", "20041100"]
 */
function splitDEG(s: string): string[] {
  const result: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '?' && i + 1 < s.length) { cur += s[++i]; continue }
    if (s[i] === ':') { result.push(cur); cur = ''; continue }
    cur += s[i]
  }
  result.push(cur)
  return result
}

/**
 * Split a FinTS message element string by unescaped '+'.
 * e.g. "280:20041100+username+0+1" → ["280:20041100", "username", "0", "1"]
 */
function splitDE(s: string): string[] {
  const result: string[] = []
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

/**
 * Build a FinTS message with correct HNHBK header and HNHBS footer.
 * Segments must already be fully formed strings (including trailing `'`).
 */
function buildMessage(dialogId: string, msgNo: number, ...segs: string[]): string {
  const footer = `HNHBS:${segs.length + 2}:1+${msgNo}'`
  const body = segs.join('') + footer

  // HNHBK must contain total message length (including itself)
  // We compute it iteratively because the length field is zero-padded to 12 digits.
  const stub = `HNHBK:1:3+000000000000+300+${dialogId}+${msgNo}'`
  const total = stub.length + body.length
  const header = `HNHBK:1:3+${String(total).padStart(12, '0')}+300+${dialogId}+${msgNo}'`

  return header + body
}

/** Format a Date as YYYYMMDD for FinTS. */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/** Format a Date as HHMMSS for FinTS. */
function fmtTime(d: Date): string {
  return d.toISOString().slice(11, 19).replace(/:/g, '')
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function httpPost(url: string, body: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new TextEncoder().encode(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from FinTS server`)
  const buf = await res.arrayBuffer()
  // FinTS responses are typically ISO-8859-1
  return new TextDecoder('iso-8859-1').decode(buf)
}

// ─── Response parsing ─────────────────────────────────────────────────────────

export interface FinTSSegment {
  name: string
  version: number
  position: number
  /** All data elements after the segment header "NAME:pos:ver", split by '+'. */
  fields: string[]
  raw: string
}

/**
 * Parse a FinTS response string into segments.
 * Handles escaped characters and binary blobs (@length@data).
 */
export function parseResponse(text: string): FinTSSegment[] {
  const segs: FinTSSegment[] = []
  let cur = ''
  let i = 0

  while (i < text.length) {
    const c = text[i]

    // Binary blob: @length@data
    if (c === '@') {
      let lenStr = ''
      i++
      while (i < text.length && text[i] !== '@') { lenStr += text[i++] }
      i++ // skip closing @
      const len = parseInt(lenStr)
      cur += `@${lenStr}@${text.slice(i, i + len)}`
      i += len
      continue
    }

    // Escaped character
    if (c === '?' && i + 1 < text.length) {
      cur += '?' + text[++i]
      i++
      continue
    }

    // Segment terminator
    if (c === "'") {
      cur = cur.trim()
      if (cur) {
        const colonIdx = cur.indexOf(':')
        if (colonIdx > 0) {
          const name = cur.slice(0, colonIdx)
          const rest = cur.slice(colonIdx + 1)
          // rest = "pos:ver+field1+field2+..."
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

function findSegs(segs: FinTSSegment[], name: string): FinTSSegment[] {
  return segs.filter(s => s.name === name)
}

function findSeg(segs: FinTSSegment[], name: string): FinTSSegment | undefined {
  return segs.find(s => s.name === name)
}

/** Extract the server-assigned dialog ID from HNHBK. */
function getDialogId(segs: FinTSSegment[]): string {
  const h = findSeg(segs, 'HNHBK')
  if (!h) return '0'
  // HNHBK fields: [totalLength, version, dialogId, msgNo]
  return h.fields[2] ?? '0'
}

/** Throw if server returned an error code (≥ 9000). */
function assertNoError(segs: FinTSSegment[]): void {
  for (const seg of segs) {
    if (seg.name !== 'HIRMG' && seg.name !== 'HIRMS') continue
    for (const field of seg.fields) {
      const parts = splitDEG(field)
      const code = parseInt(parts[0] ?? '0')
      if (code >= 9000) {
        const msg = parts[2] ? unesc(parts[2]) : `Code ${code}`
        throw new Error(`FinTS error ${code}: ${msg}`)
      }
    }
  }
}

/**
 * Extract raw binary blobs from a field that contains `@length@data` entries.
 * Returns the decoded string content of each blob.
 */
function extractBlobs(field: string): string[] {
  const blobs: string[] = []
  let i = 0
  while (i < field.length) {
    if (field[i] === '@') {
      const lenEnd = field.indexOf('@', i + 1)
      if (lenEnd < 0) break
      const len = parseInt(field.slice(i + 1, lenEnd))
      blobs.push(field.slice(lenEnd + 1, lenEnd + 1 + len))
      i = lenEnd + 1 + len
    } else {
      i++
    }
  }
  return blobs
}

// ─── MT940 parser ─────────────────────────────────────────────────────────────

export interface RawTransaction {
  date: string        // ISO 8601  YYYY-MM-DD
  amount: number      // negative = debit, positive = credit
  description: string
  counterparty: string
  counterpartyIban: string
}

/**
 * Parse SWIFT MT940 statement data as returned in HIKAZ blobs.
 * Handles both structured (?20/?32/?31) and unstructured descriptions.
 */
export function parseMT940(data: string): RawTransaction[] {
  const txs: RawTransaction[] = []
  const lines = data.split(/\r?\n/)
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    // :61: — transaction entry
    // Format: :61:YYMMDD[MMDD][C|D][R][CURRENCY]AMOUNT[N<ref>][//bank-ref]\n[customer-ref]
    if (line.startsWith(':61:')) {
      const content = line.slice(4)
      // Match: YYMMDD + optional MMDD + C/D + optional R + amount (nnnnn,nn)
      const m = content.match(/^(\d{6})(\d{4})?([CD])R?[A-Z]{0,3}(\d+),(\d*)/)
      if (!m) { i++; continue }

      const [, yymmdd, , cd, intPart, decPart] = m
      const yy = parseInt(yymmdd.slice(0, 2))
      const mm = yymmdd.slice(2, 4)
      const dd = yymmdd.slice(4, 6)
      const year = yy + (yy > 50 ? 1900 : 2000)
      const isoDate = `${year}-${mm}-${dd}`
      const sign = cd === 'D' ? -1 : 1
      const amount = sign * parseFloat(`${intPart}.${decPart || '00'}`)

      // Collect :86: description lines
      let desc86 = ''
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j].trim()
        if (next.startsWith(':86:')) {
          desc86 += next.slice(4)
          j++
          // continuation lines (no tag prefix) up to next :XX: or end
          while (j < lines.length && !lines[j].startsWith(':')) {
            desc86 += lines[j].trim()
            j++
          }
          break
        }
        // skip :62: and :64: etc.
        if (next.match(/^:\d{2}[A-Z]?:/)) break
        j++
      }

      // Parse :86: structured GVC fields
      let description = ''
      let counterparty = ''
      let counterpartyIban = ''

      if (desc86) {
        // German banks use ?XX sub-fields in :86:
        const subfields: Record<string, string> = {}
        const subRe = /\?(\d{2})([^?]*)/g
        let sm: RegExpExecArray | null
        while ((sm = subRe.exec(desc86)) !== null) {
          subfields[sm[1]] = sm[2]
        }

        if (Object.keys(subfields).length > 0) {
          // ?20-?29 = Verwendungszweck (purpose/reference)
          description = [20,21,22,23,24,25,26,27,28,29]
            .map(n => subfields[String(n).padStart(2,'0')] ?? '')
            .join('').trim()
          // ?30 = counterparty BIC, ?31 = counterparty IBAN, ?32-33 = counterparty name
          counterpartyIban = (subfields['31'] ?? '').trim()
          counterparty = [(subfields['32'] ?? ''), (subfields['33'] ?? '')].join(' ').trim()
        } else {
          // Unstructured: strip GVC code (3 chars) and use rest as description
          description = desc86.slice(3).trim()
        }
      }

      txs.push({ date: isoDate, amount, description, counterparty, counterpartyIban })
      i = j
      continue
    }

    i++
  }

  return txs
}

// ─── FinTS dialog state ───────────────────────────────────────────────────────

interface DialogState {
  dialogId: string
  msgNo: number
  secRef: number
  sysId: string
}

function newState(): DialogState {
  return { dialogId: '0', msgNo: 0, secRef: 0, sysId: '0' }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FinTSConfig {
  /** BLZ extracted from the IBAN (8 digits starting at position 4). */
  blz: string
  /** Commerzbank OnlineBanking username. */
  username: string
  /** Commerzbank OnlineBanking PIN. */
  pin: string
  /** IBAN to fetch (defaults to first account). */
  iban?: string
  /** FinTS server URL. Defaults to Commerzbank production. */
  url?: string
}

const DEFAULT_URL = 'https://fints.commerzbank.de/fints'

/**
 * Fetch account transactions from Commerzbank via FinTS 3.0 PIN/TAN.
 * Performs:
 *   1. Anonymous dialog → discover supported security function code
 *   2. Authenticated dialog → HKKAZ request → MT940 parse
 *   3. Dialog end
 */
export async function fetchTransactions(
  cfg: FinTSConfig,
  fromDate: Date,
  toDate: Date,
): Promise<RawTransaction[]> {
  const url = cfg.url ?? DEFAULT_URL
  const state = newState()

  // ── Step 1: Anonymous dialog to get BPD and HIPINS ──────────────────────

  let secFun = '999' // default: generic PIN/TAN single-step

  try {
    state.msgNo++
    const anonMsg = buildMessage('0', state.msgNo,
      `HKIDN:2:2+280:${cfg.blz}+anonymous+0+0'`,
      `HKVVB:3:3+0+0+0+FinAnts+1.0'`,
      `HKSYN:4:3+0'`,
    )
    const anonResp = await httpPost(url, anonMsg)
    const anonSegs = parseResponse(anonResp)
    const anonDialogId = getDialogId(anonSegs)

    // Extract supported single-step security function from HIPINS
    // HIPINS:X:Y:Z+maxPINLen+maxTANLen+needsTAN+[...]+secfun1:secfunName1:konto+...
    const hipins = findSeg(anonSegs, 'HIPINS')
    if (hipins) {
      // Fields after header: minPIN+maxPIN+maxTAN+needsTAN+...secfun entries
      // secfun entries start at field index 4+, format: <code>:<name>:<account>
      for (let f = 4; f < hipins.fields.length; f++) {
        const parts = splitDEG(hipins.fields[f])
        const code = parseInt(parts[0] ?? '0')
        // Prefer lowest code (simplest procedure) that is numeric
        if (!isNaN(code) && code >= 900 && code <= 999) {
          secFun = String(code)
          break
        }
      }
    }

    // End anonymous dialog
    state.msgNo++
    const endMsg = buildMessage(anonDialogId, state.msgNo,
      `HKEND:2:1+${anonDialogId}'`,
    )
    await httpPost(url, endMsg)
  } catch {
    // Anonymous dialog failure is non-fatal; proceed with default secFun
  }

  // ── Step 2: Authenticated dialog with HKKAZ ──────────────────────────────

  state.msgNo = 1
  state.secRef++
  const secRef = String(state.secRef)
  const now = new Date()
  const dateStr = fmtDate(now)
  const timeStr = fmtTime(now)
  const fromStr = fmtDate(fromDate)
  const toStr   = fmtDate(toDate)

  // IBAN field for HKKAZ: just the IBAN, rest empty DEG members
  const ibanField = cfg.iban ? esc(cfg.iban) : ''

  const authMsg = buildMessage('0', state.msgNo,
    // Security header: PIN/TAN Einschritt, no TAN needed for read ops
    `HNSHK:2:4+998+${secFun}+${secRef}+1+1+1::${esc(state.sysId)}+1+1:${dateStr}:${timeStr}+1:999:1+1:999:1+280:${cfg.blz}+${esc(cfg.username)}+J'`,
    // Client identification
    `HKIDN:3:2+280:${cfg.blz}+${esc(cfg.username)}+${esc(state.sysId)}+1'`,
    // Processing params
    `HKVVB:4:3+0+0+0+FinAnts+1.0'`,
    // TAN procedure selection (same secFun, no challenge)
    `HKTAN:5:6+${secFun}+J'`,
    // Account statement request: IBAN + country + fromDate + toDate + all bookings
    `HKKAZ:6:7+${ibanField}+DE+${fromStr}+${toStr}+N'`,
    // Security footer with PIN (no TAN needed for HKKAZ)
    `HNSHA:7:2+${secRef}++${esc(cfg.pin)}'`,
  )

  const authResp = await httpPost(url, authMsg)
  const authSegs = parseResponse(authResp)

  assertNoError(authSegs)

  const authDialogId = getDialogId(authSegs)

  // ── Step 3: Extract and parse MT940 blobs from HIKAZ ─────────────────────

  const allTxs: RawTransaction[] = []

  for (const seg of findSegs(authSegs, 'HIKAZ')) {
    // HIKAZ fields: [reference, account, booked_blob, pending_blob?, ...]
    // Booked transactions are in the first @...@ blob of field[2]
    for (const field of seg.fields) {
      for (const blob of extractBlobs(field)) {
        allTxs.push(...parseMT940(blob))
      }
    }
  }

  // ── Step 4: End authenticated dialog ─────────────────────────────────────

  if (authDialogId !== '0') {
    state.msgNo++
    state.secRef++
    const secRef2 = String(state.secRef)
    const now2 = new Date()

    const endMsg = buildMessage(authDialogId, state.msgNo,
      `HNSHK:2:4+998+${secFun}+${secRef2}+1+1+1::${esc(state.sysId)}+1+1:${fmtDate(now2)}:${fmtTime(now2)}+1:999:1+1:999:1+280:${cfg.blz}+${esc(cfg.username)}+J'`,
      `HKEND:3:1+${authDialogId}'`,
      `HNSHA:4:2+${secRef2}++${esc(cfg.pin)}'`,
    )
    await httpPost(url, endMsg).catch(() => { /* ignore end-dialog errors */ })
  }

  return allTxs
}

/**
 * Extract BLZ (8-digit bank code) from a German IBAN.
 * DE89 200411001234567890 → "20041100"
 */
export function blzFromIban(iban: string): string {
  const clean = iban.replace(/\s/g, '').toUpperCase()
  if (!clean.startsWith('DE') || clean.length < 12) {
    throw new Error('Ungültige deutsche IBAN')
  }
  return clean.slice(4, 12)
}
