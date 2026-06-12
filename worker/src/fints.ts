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

/** Split by unescaped '+', skipping over @len@ binary blobs. */
function splitDE(s: string): string[] {
  const r: string[] = []; let c = ''; let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '?' && i + 1 < s.length) { c += s[++i]; i++; continue }
    if (ch === '@') {
      const at2 = s.indexOf('@', i + 1)
      if (at2 > i) {
        const len = parseInt(s.slice(i + 1, at2))
        if (!isNaN(len)) { c += s.slice(i, at2 + 1 + len); i = at2 + 1 + len; continue }
      }
    }
    if (ch === '+') { r.push(c); c = ''; i++; continue }
    c += ch; i++
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
  // FinTS over HTTPS: both request and response are Base64-encoded (RFC 2045)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: btoa(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} vom FinTS-Server`)
  const raw = await res.text()
  try {
    return atob(raw.replace(/[\r\n]/g, ''))
  } catch {
    return raw
  }
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

interface MT940Result {
  transactions: RawTransaction[]
  iban: string
  closingBalance: number | null
  closingDate: string | null
  currency: string
}

function parseMT940(data: string, defaultAccountIban: string): MT940Result {
  const txs: RawTransaction[] = []
  const lines = data.split(/\r?\n/)
  let accountIban = defaultAccountIban
  let closingBalance: number | null = null
  let closingDate: string | null = null
  let currency = 'EUR'
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()

    // :25: account IBAN
    if (line.startsWith(':25:')) {
      const raw = line.slice(4).split('/')[0].replace(/\s/g, '')
      if (raw.length >= 15) accountIban = raw
      i++; continue
    }

    // :62F: or :62M: closing booked balance  →  CDyymmddCURamount,cents
    if (line.startsWith(':62F:') || line.startsWith(':62M:')) {
      const m = line.slice(5).match(/^([CD])(\d{6})([A-Z]{3})(\d+),(\d*)/)
      if (m) {
        const [, cd, yymmdd, cur, intPart, decPart] = m
        const yy = parseInt(yymmdd.slice(0, 2))
        const fullYear = yy + (yy >= 70 ? 1900 : 2000)
        closingDate = `${fullYear}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`
        currency = cur
        const amt = parseFloat(`${intPart}.${decPart || '00'}`)
        closingBalance = cd === 'D' ? -amt : amt
      }
      i++; continue
    }

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
  return { transactions: txs, iban: accountIban, closingBalance, closingDate, currency }
}

// ─── FinTS dialog helpers ─────────────────────────────────────────────────────

const DEFAULT_URL = 'https://fints.commerzbank.de/fints'

function buildSecHdr(pos: number, secFun: string, secRef: string, blz: string, name: string): string {
  const now = new Date()
  return `HNSHK:${pos}:4+998:1+${secFun}+${secRef}+1+1+1::0+1+1:${fmtDate(now)}:${fmtTime(now)}+1:999:1+6:10:16+280:${blz}:${esc(name)}:S:0:0'`
}

function buildSecFtr(pos: number, secRef: string, pin: string, tan?: string): string {
  return `HNSHA:${pos}:2+${secRef}++${esc(pin)}${tan ? ':' + esc(tan) : ''}'`
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
      console.log('[FinTS] anon raw response len:', anonResp.length, '| preview:', JSON.stringify(anonResp.slice(0, 120)))
      const anonSegs = parseResponse(anonResp)
      const anonId = getDialogId(anonSegs)
      console.log('[FinTS] anon dialog segments:', anonSegs.map(s => s.name).join(' '))

      const hipins = findSeg(anonSegs, 'HIPINS')
      if (hipins) {
        for (let f = 4; f < hipins.fields.length; f++) {
          const p = splitDEG(hipins.fields[f])
          const c = parseInt(p[0] ?? '0')
          if (!isNaN(c) && c >= 900 && c <= 999) { resolvedSecFun = String(c); break }
        }
      }
      console.log('[FinTS] secFun resolved:', resolvedSecFun, hipins ? '(from HIPINS)' : '(default)')

      if (anonId !== '0') {
        await httpPost(url, buildMessage(anonId, 2, `HKEND:2:1+${anonId}'`))
          .catch(() => {})
      }
    } catch (e) {
      console.warn('[FinTS] anon dialog failed (non-fatal):', String(e))
    }
  }

  const fromStr = fmtDate(fromDate)
  const toStr   = fmtDate(toDate)
  let secRef = pendingSecRef ? pendingSecRef + 1 : 1

  // ── Step 1: Dialog-Init ───────────────────────────────────────────────────
  // When resuming with a TAN, the dialog is already open — skip init.
  let dialogId = pendingDialogId ?? '0'
  let initSegs2: FinTSSegment[] = []

  if (!pendingDialogId) {
    console.log('[FinTS] dialog-init → secFun:', resolvedSecFun)
    const initMsg = buildMessage('0', 1,
      buildSecHdr(2, resolvedSecFun, String(secRef), blz, name),
      `HKIDN:3:2+280:${blz}+${esc(name)}+0+1'`,
      `HKVVB:4:3+0+0+0+FinAnts+1.0'`,
      buildSecFtr(5, String(secRef), cfg.pin),
    )
    const initResp = await httpPost(url, initMsg)
    initSegs2 = parseResponse(initResp)
    console.log('[FinTS] init segments:', initSegs2.map(s => `${s.name}:${s.version}`).join(' '))
    for (const s of initSegs2.filter(s => s.name === 'HIRMG' || s.name === 'HIRMS')) {
      for (const f of s.fields) {
        const p = splitDEG(f)
        console.log(`[FinTS] init ${s.name} code ${p[0]}: ${unesc(p[2] ?? '')}`)
      }
    }
    assertNoError(initSegs2)
    dialogId = getDialogId(initSegs2)
    secRef++
    console.log('[FinTS] dialog opened, id:', dialogId)
  }

  // ── Step 2: Send jobs ─────────────────────────────────────────────────────
  console.log('[FinTS] jobs → secFun:', resolvedSecFun, 'from:', fromStr, 'to:', toStr)
  const jobMsg = buildMessage(dialogId, 2,
    buildSecHdr(2, resolvedSecFun, String(secRef), blz, name),
    `HKSAL:3:7+::0+J'`,
    `HKKAZ:4:7+::0+J+${fromStr}+${toStr}++'`,
    buildSecFtr(5, String(secRef), cfg.pin, tan),
  )
  let jobResp: string
  try {
    jobResp = await httpPost(url, jobMsg)
  } catch (e) {
    console.error('[FinTS] jobs httpPost threw:', String(e))
    throw e
  }
  console.log('[FinTS] jobs raw response len:', jobResp.length, '| preview:', JSON.stringify(jobResp.slice(0, 120)))
  const jobSegs = parseResponse(jobResp)
  console.log('[FinTS] jobs segments:', jobSegs.map(s => `${s.name}:${s.version}`).join(' '))

  for (const s of jobSegs.filter(s => s.name === 'HIRMG' || s.name === 'HIRMS')) {
    for (const f of s.fields) {
      const p = splitDEG(f)
      console.log(`[FinTS] jobs ${s.name} code ${p[0]}: ${unesc(p[2] ?? '')}`)
    }
  }

  // Check for TAN challenge
  const challengeData = parseHITAN(jobSegs)
  console.log('[FinTS] HITAN found:', !!challengeData, challengeData ? `method=${challengeData.method}` : '')

  if (challengeData && !tan) {
    return {
      accounts: [],
      transactions: [],
      challenge: {
        ...challengeData,
        dialogId,
        secRef,
        secFun: resolvedSecFun,
      },
    }
  }

  assertNoError(jobSegs)
  secRef++

  // ── Parse results ─────────────────────────────────────────────────────────
  const accountPartials = parseHIUPD([...initSegs2, ...jobSegs])
  const balances = parseHISAL(jobSegs)
  console.log('[FinTS] HIUPD accounts:', accountPartials.length, '| HISAL entries:', balances.size)

  const allTxs: RawTransaction[] = []
  const mt940Balances = new Map<string, { balance: number; date: string; currency: string }>()

  for (const seg of findSegs(jobSegs, 'HIKAZ')) {
    const segIban = (splitDEG(seg.fields[0] ?? '')[0] ?? '').replace(/\s/g, '')
    for (const field of seg.fields) {
      for (const blob of extractBlobs(field)) {
        const result = parseMT940(blob, segIban)
        allTxs.push(...result.transactions)
        if (result.closingBalance !== null && result.iban) {
          mt940Balances.set(result.iban, {
            balance: result.closingBalance,
            date: result.closingDate ?? new Date().toISOString().slice(0, 10),
            currency: result.currency,
          })
        }
      }
    }
  }

  let accounts: FinTSAccount[]
  if (accountPartials.length > 0) {
    accounts = accountPartials.map(a => {
      const hisal = balances.get(a.iban ?? '')
      const mt940 = mt940Balances.get(a.iban ?? '')
      const bal = hisal ?? (mt940 ? { balance: mt940.balance, date: mt940.date } : { balance: 0, date: new Date().toISOString().slice(0, 10) })
      return {
        iban: a.iban ?? '',
        blz: a.blz ?? '',
        accountNumber: a.accountNumber ?? '',
        owner: a.owner ?? '',
        description: a.description ?? '',
        type: a.type ?? 'other',
        currency: mt940?.currency ?? a.currency ?? 'EUR',
        balance: bal.balance,
        balanceDate: bal.date,
      }
    })
  } else {
    accounts = Array.from(mt940Balances.entries()).map(([iban, bal]) => ({
      iban, blz, accountNumber: '', owner: name, description: '',
      type: 'giro' as const, currency: bal.currency,
      balance: bal.balance, balanceDate: bal.date,
    }))
  }

  console.log('[FinTS] result: accounts:', accounts.length, 'transactions:', allTxs.length)

  // ── Step 3: Dialog-End ────────────────────────────────────────────────────
  if (dialogId !== '0') {
    await httpPost(url, buildMessage(dialogId, 3,
      buildSecHdr(2, resolvedSecFun, String(secRef), blz, name),
      `HKEND:3:1+${dialogId}'`,
      buildSecFtr(4, String(secRef), cfg.pin),
    )).catch(() => {})
  }

  return { accounts, transactions: allTxs }
}

export function blzFromIban(iban: string): string {
  const c = iban.replace(/\s/g, '').toUpperCase()
  if (!c.startsWith('DE') || c.length < 12) throw new Error('Ungültige deutsche IBAN')
  return c.slice(4, 12)
}
