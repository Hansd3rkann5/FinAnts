/**
 * FinTS 3.0 / HBCI client for Cloudflare Workers.
 * Supports: multi-account balance (HKSAL), account statements (HKKAZ),
 * and photoTAN / push TAN challenge flow (HITAN).
 */

// ─── Encoding helpers ─────────────────────────────────────────────────────────

export function esc(v: string): string {
  return v.replace(/[?+:@']/g, c => `?${c}`)
}

export function unesc(v: string): string {
  return v.replace(/\?(.)/g, '$1')
}

/** Split by unescaped '+'. */
function splitDE(s: string): string[] {
  const r: string[] = []; let c = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '?' && i + 1 < s.length) { c += s[++i]; continue }
    if (s[i] === '+') { r.push(c); c = ''; continue }
    c += s[i]
  }
  r.push(c); return r
}

/** Split by unescaped ':'. */
export function splitDEG(s: string): string[] {
  const r: string[] = []; let c = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '?' && i + 1 < s.length) { c += s[++i]; continue }
    if (s[i] === ':') { r.push(c); c = ''; continue }
    c += s[i]
  }
  r.push(c); return r
}

// ─── Message building ─────────────────────────────────────────────────────────

export function buildMessage(dialogId: string, msgNo: number, ...segs: string[]): string {
  const footer = `HNHBS:${segs.length + 2}:1+${msgNo}'`
  const body = segs.join('') + footer
  const stub = `HNHBK:1:3+000000000000+300+${dialogId}+${msgNo}'`
  const total = stub.length + body.length
  return `HNHBK:1:3+${String(total).padStart(12, '0')}+300+${dialogId}+${msgNo}'${body}`
}

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10).replace(/-/g, '') }
function fmtTime(d: Date): string { return d.toISOString().slice(11, 19).replace(/:/g, '') }

function parseGermanAmount(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0
}

function fintsDateToISO(s: string): string {
  if (s.length < 8) return new Date().toISOString().slice(0, 10)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

export async function httpPost(url: string, body: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new TextEncoder().encode(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} vom FinTS-Server`)
  return new TextDecoder('iso-8859-1').decode(await res.arrayBuffer())
}

// ─── Response parsing ─────────────────────────────────────────────────────────

export interface FinTSSegment {
  name: string; version: number; position: number
  fields: string[]; raw: string
}

export function parseResponse(text: string): FinTSSegment[] {
  const segs: FinTSSegment[] = []
  let cur = '', i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '@') {
      let ls = ''; i++
      while (i < text.length && text[i] !== '@') { ls += text[i++] }
      i++
      const len = parseInt(ls)
      cur += `@${ls}@${text.slice(i, i + len)}`
      i += len; continue
    }
    if (c === '?' && i + 1 < text.length) { cur += '?' + text[++i]; i++; continue }
    if (c === "'") {
      cur = cur.trim()
      if (cur) {
        const ci = cur.indexOf(':')
        if (ci > 0) {
          const name = cur.slice(0, ci)
          const rest = cur.slice(ci + 1)
          const pi = rest.indexOf('+')
          const hdr = pi >= 0 ? rest.slice(0, pi) : rest
          const hp = hdr.split(':')
          segs.push({
            name, version: parseInt(hp[1]) || 0, position: parseInt(hp[0]) || 0,
            fields: pi >= 0 ? splitDE(rest.slice(pi + 1)) : [],
            raw: cur,
          })
        }
      }
      cur = ''; i++; continue
    }
    cur += c; i++
  }
  return segs
}

export function findSeg(segs: FinTSSegment[], name: string): FinTSSegment | undefined {
  return segs.find(s => s.name === name)
}

export function findSegs(segs: FinTSSegment[], name: string): FinTSSegment[] {
  return segs.filter(s => s.name === name)
}

export function getDialogId(segs: FinTSSegment[]): string {
  return findSeg(segs, 'HNHBK')?.fields[2] ?? '0'
}

export function assertNoError(segs: FinTSSegment[]): void {
  for (const s of segs) {
    if (s.name !== 'HIRMG' && s.name !== 'HIRMS') continue
    for (const f of s.fields) {
      const p = splitDEG(f); const code = parseInt(p[0] ?? '0')
      if (code >= 9000) throw new Error(`FinTS ${code}: ${unesc(p[2] ?? String(code))}`)
    }
  }
}

function extractBlobs(field: string): string[] {
  const blobs: string[] = []; let i = 0
  while (i < field.length) {
    if (field[i] !== '@') { i++; continue }
    const le = field.indexOf('@', i + 1); if (le < 0) break
    const len = parseInt(field.slice(i + 1, le))
    blobs.push(field.slice(le + 1, le + 1 + len))
    i = le + 1 + len
  }
  return blobs
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface FinTSAccount {
  iban: string
  blz: string
  accountNumber: string
  owner: string
  description: string
  type: 'giro' | 'savings' | 'depot' | 'loan' | 'other'
  currency: string
  balance: number
  balanceDate: string
}

export interface RawTransaction {
  date: string
  amount: number
  description: string
  counterparty: string
  counterpartyIban: string
  accountIban: string
}

export interface TanChallenge {
  method: 'photoTAN' | 'pushTAN' | 'smsTAN' | 'other'
  imageBase64?: string   // photoTAN PNG as base64
  hint?: string
  orderRef: string
  dialogId: string
  secRef: number
  secFun: string
}

// ─── HIUPD parser (account list from bank) ───────────────────────────────────

function mapAccountType(code: string): FinTSAccount['type'] {
  const m: Record<string, FinTSAccount['type']> = {
    '1': 'giro', '2': 'savings', '3': 'savings',
    '4': 'depot', '5': 'loan', '97': 'giro',
  }
  return m[code] ?? 'other'
}

function parseHIUPD(segs: FinTSSegment[]): Partial<FinTSAccount>[] {
  return findSegs(segs, 'HIUPD').map(seg => {
    const f = seg.fields
    const conn = splitDEG(f[0] ?? '')
    return {
      iban: (conn[0] ?? '').replace(/\s/g, ''),
      blz: conn[2] ?? '',
      accountNumber: conn[3] ?? '',
      owner: unesc(f[4] ?? ''),
      description: unesc(f[5] ?? ''),
      type: mapAccountType(f[2] ?? ''),
      currency: f[3] ?? 'EUR',
      balance: 0,
      balanceDate: new Date().toISOString().slice(0, 10),
    }
  }).filter(a => !!a.iban)
}

// ─── HISAL parser (account balances) ─────────────────────────────────────────

function parseHISAL(segs: FinTSSegment[]): Map<string, { balance: number; date: string }> {
  const map = new Map<string, { balance: number; date: string }>()
  for (const seg of findSegs(segs, 'HISAL')) {
    const f = seg.fields
    const conn = splitDEG(f[0] ?? '')
    const iban = (conn[0] ?? '').replace(/\s/g, '')
    if (!iban) continue

    // Field 3: booked balance DEG → C/D : amount : date
    const balParts = splitDEG(f[3] ?? '')
    const cd = balParts[0] ?? 'C'
    const amount = parseGermanAmount(balParts[1] ?? '0')
    const date = fintsDateToISO(balParts[2] ?? '')
    map.set(iban, { balance: cd === 'D' ? -amount : amount, date })
  }
  return map
}

// ─── HITAN parser (TAN challenge) ────────────────────────────────────────────

function parseHITAN(segs: FinTSSegment[]): Omit<TanChallenge, 'dialogId' | 'secRef' | 'secFun'> | null {
  const hitan = findSeg(segs, 'HITAN')
  if (!hitan) return null

  const f = hitan.fields
  const orderRef = f[2] ?? ''
  const challengeRaw = f[3] ?? ''
  const hint = f[4] ? unesc(f[4]) : undefined

  // Extract binary blob for photoTAN image
  let imageBase64: string | undefined
  const blobs = extractBlobs(challengeRaw)
  if (blobs.length > 0) {
    // Convert ISO-8859-1 binary string to base64
    const bytes = Uint8Array.from(blobs[0], c => c.charCodeAt(0))
    imageBase64 = btoa(String.fromCharCode(...bytes))
  }

  let method: TanChallenge['method'] = 'other'
  if (imageBase64) method = 'photoTAN'
  else if (hint?.toLowerCase().includes('push')) method = 'pushTAN'
  else if (challengeRaw && !blobs.length) method = 'smsTAN'

  return { method, imageBase64, hint, orderRef }
}

// ─── MT940 parser ─────────────────────────────────────────────────────────────

function parseMT940(data: string, accountIban: string): RawTransaction[] {
  const txs: RawTransaction[] = []
  const lines = data.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.startsWith(':61:')) {
      const m = line.slice(4).match(/^(\d{2})(\d{2})(\d{2})(\d{4})?([CD])R?[A-Z]{0,3}(\d+),(\d*)/)
      if (!m) { i++; continue }
      const [, yy, mm, dd, , cd, intPart, decPart] = m
      const year = parseInt(yy) + (parseInt(yy) > 50 ? 1900 : 2000)
      const isoDate = `${year}-${mm}-${dd}`
      const amount = (cd === 'D' ? -1 : 1) * parseFloat(`${intPart}.${decPart || '00'}`)

      let desc86 = ''; let j = i + 1
      while (j < lines.length) {
        const next = lines[j].trim()
        if (next.startsWith(':86:')) {
          desc86 += next.slice(4); j++
          while (j < lines.length && !lines[j].startsWith(':')) { desc86 += lines[j].trim(); j++ }
          break
        }
        if (next.match(/^:\d{2}[A-Z]?:/)) break
        j++
      }

      const sub: Record<string, string> = {}
      const re = /\?(\d{2})([^?]*)/g; let sm: RegExpExecArray | null
      while ((sm = re.exec(desc86)) !== null) sub[sm[1]] = sm[2]

      let description = '', counterparty = '', counterpartyIban = ''
      if (Object.keys(sub).length > 0) {
        description = [20,21,22,23,24,25,26,27,28,29]
          .map(n => sub[String(n).padStart(2,'0')] ?? '').join('').trim()
        counterpartyIban = (sub['31'] ?? '').trim()
        counterparty = [(sub['32'] ?? ''), (sub['33'] ?? '')].join(' ').trim()
      } else {
        description = desc86.slice(3).trim()
      }

      txs.push({ date: isoDate, amount, description, counterparty, counterpartyIban, accountIban })
      i = j; continue
    }
    i++
  }
  return txs
}

// ─── FinTS dialog helpers ─────────────────────────────────────────────────────

const DEFAULT_URL = 'https://fints.commerzbank.de/fints'

function buildSecHdr(pos: number, secFun: string, secRef: string, blz: string, name: string): string {
  const now = new Date()
  return `HNSHK:${pos}:4+998+${secFun}+${secRef}+1+1+1::0+1+1:${fmtDate(now)}:${fmtTime(now)}+1:999:1+1:999:1+280:${blz}+${esc(name)}+J'`
}

function buildSecFtr(pos: number, secRef: string, pin: string, tan?: string): string {
  return `HNSHA:${pos}:2+${secRef}++${esc(pin)}${tan ? '+' + esc(tan) : ''}'`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FinTSConfig {
  blz: string
  username: string
  pin: string
  url?: string
}

export interface SyncResult {
  accounts: FinTSAccount[]
  transactions: RawTransaction[]
  /** Present when bank requires TAN before returning data. */
  challenge?: TanChallenge
}

/**
 * Full sync: fetch all accounts with balances and all transactions.
 * Handles photoTAN / pushTAN challenges gracefully.
 */
export async function syncAll(
  cfg: FinTSConfig,
  fromDate: Date,
  toDate: Date,
  tan?: string,               // TAN to resume a pending challenge
  pendingDialogId?: string,   // resume existing dialog
  pendingSecRef?: number,
  secFun?: string,
): Promise<SyncResult> {
  const url = cfg.url ?? DEFAULT_URL
  const blz = cfg.blz
  const name = cfg.username

  let resolvedSecFun = secFun ?? '999'

  // ── Discover security function (anonymous dialog) ─────────────────────────
  if (!secFun && !pendingDialogId) {
    try {
      const anonMsg = buildMessage('0', 1,
        `HKIDN:2:2+280:${blz}+anonymous+0+0'`,
        `HKVVB:3:3+0+0+0+FinAnts+1.0'`,
        `HKSYN:4:3+0'`,
      )
      const anonResp = await httpPost(url, anonMsg)
      const anonSegs = parseResponse(anonResp)
      const anonId = getDialogId(anonSegs)

      // Extract lowest supported security function from HIPINS
      const hipins = findSeg(anonSegs, 'HIPINS')
      if (hipins) {
        for (let f = 4; f < hipins.fields.length; f++) {
          const p = splitDEG(hipins.fields[f])
          const c = parseInt(p[0] ?? '0')
          if (!isNaN(c) && c >= 900 && c <= 999) { resolvedSecFun = String(c); break }
        }
      }

      if (anonId !== '0') {
        await httpPost(url, buildMessage(anonId, 2, `HKEND:2:1+${anonId}'`))
          .catch(() => {})
      }
    } catch {
      // non-fatal, use default secFun
    }
  }

  // ── Authenticated dialog ──────────────────────────────────────────────────
  const dialogId = pendingDialogId ?? '0'
  const secRef = pendingSecRef ? pendingSecRef + 1 : 1
  const secRefStr = String(secRef)
  const fromStr = fmtDate(fromDate)
  const toStr   = fmtDate(toDate)

  const authSegs: string[] = [
    buildSecHdr(2, resolvedSecFun, secRefStr, blz, name),
    `HKIDN:3:2+280:${blz}+${esc(name)}+0+1'`,
    `HKVVB:4:3+0+0+0+FinAnts+1.0'`,
    `HKTAN:5:6+${resolvedSecFun}+J'`,
    // Request balances for all accounts (no IBAN = Alle Konten)
    `HKSAL:6:7++DE+N'`,
    // Request transactions for all accounts
    `HKKAZ:7:7++DE+${fromStr}+${toStr}+N'`,
    buildSecFtr(8, secRefStr, cfg.pin, tan),
  ]

  const authMsg = buildMessage(dialogId, 1, ...authSegs)
  const authResp = await httpPost(url, authMsg)
  const authSegs2 = parseResponse(authResp)

  // Check for TAN challenge (HITAN)
  const challengeData = parseHITAN(authSegs2)
  const authDialogId = getDialogId(authSegs2)

  if (challengeData && !tan) {
    // Bank wants a TAN — return challenge to caller
    return {
      accounts: [],
      transactions: [],
      challenge: {
        ...challengeData,
        dialogId: authDialogId,
        secRef,
        secFun: resolvedSecFun,
      },
    }
  }

  // If we got here, no challenge or TAN was provided — check for errors
  assertNoError(authSegs2)

  // ── Parse accounts from HIUPD ─────────────────────────────────────────────
  const accountPartials = parseHIUPD(authSegs2)
  const balances = parseHISAL(authSegs2)

  const accounts: FinTSAccount[] = accountPartials.map(a => {
    const bal = balances.get(a.iban ?? '') ?? { balance: 0, date: new Date().toISOString().slice(0, 10) }
    return {
      iban: a.iban ?? '',
      blz: a.blz ?? '',
      accountNumber: a.accountNumber ?? '',
      owner: a.owner ?? '',
      description: a.description ?? '',
      type: a.type ?? 'other',
      currency: a.currency ?? 'EUR',
      balance: bal.balance,
      balanceDate: bal.date,
    }
  })

  // ── Parse transactions from HIKAZ blobs ──────────────────────────────────
  const allTxs: RawTransaction[] = []
  for (const seg of findSegs(authSegs2, 'HIKAZ')) {
    // Determine which account this HIKAZ belongs to via its reference segment
    // Field 0 of HIKAZ response contains IBAN
    const accountIban = (splitDEG(seg.fields[0] ?? '')[0] ?? '').replace(/\s/g, '')
    for (const field of seg.fields) {
      for (const blob of extractBlobs(field)) {
        allTxs.push(...parseMT940(blob, accountIban))
      }
    }
  }

  // ── End dialog ────────────────────────────────────────────────────────────
  if (authDialogId !== '0') {
    const secRef2 = secRef + 1
    const now = new Date()
    await httpPost(url, buildMessage(authDialogId, 2,
      buildSecHdr(2, resolvedSecFun, String(secRef2), blz, name),
      `HKEND:3:1+${authDialogId}'`,
      buildSecFtr(4, String(secRef2), cfg.pin),
    )).catch(() => {})
  }

  return { accounts, transactions: allTxs }
}

export function blzFromIban(iban: string): string {
  const c = iban.replace(/\s/g, '').toUpperCase()
  if (!c.startsWith('DE') || c.length < 12) throw new Error('Ungültige deutsche IBAN')
  return c.slice(4, 12)
}
