// ─── D1 transaction store ────────────────────────────────────────────────────
//
// Canonical store for all transactions. Rows get a random unique id; de-dup is
// done explicitly at merge time by matching amount + counterparty within a small
// date window (see mergeTransactions), so the same transaction imported from
// CSV and EnableBanking — which book it on slightly different dates — collapses
// to a single row, keeping the better-structured source.

// Input accepted by the merge endpoint. Covers both the client `Transaction`
// shape (counterparty iban in `iban`) and the worker's `MappedTransaction`
// (counterparty iban in `counterpartyIban`).
export interface MergeInput {
  date: string
  amount: number
  type?: string
  description?: string
  counterparty?: string
  iban?: string
  counterpartyIban?: string
  accountIban?: string
  reference?: string
  categoryId?: string
  customLabel?: string
  customIcon?: string
  isPending?: boolean
  // Links an itemized credit-card purchase to the lump-sum Giro "Kreditkarte"
  // booking it was billed under (see scripts/ and Settings.tsx import flow).
  parentId?: string
  // Trade Republic buy/sell events only — ISIN + signed share count (positive
  // = bought, negative = sold), used to reconstruct depot holdings over time.
  isin?: string
  shares?: number
}

// Row shape returned to the client (camelCase). The client enriches these with
// merchant logos / auto-categories on load.
export interface StoredTx {
  id: string
  date: string
  amount: number
  type: string
  description: string
  counterparty: string
  iban: string | null
  accountIban: string | null
  reference: string | null
  categoryId: string | null
  customLabel: string | null
  customIcon: string | null
  source: string | null
  parentId: string | null
  isin: string | null
  shares: number | null
}

interface DbRow {
  id: string
  date: string
  amount: number
  type: string
  description: string
  counterparty: string
  iban: string | null
  account_iban: string | null
  reference: string | null
  category_id: string | null
  custom_label: string | null
  custom_icon: string | null
  source: string | null
  parent_id: string | null
  isin: string | null
  shares: number | null
}

// ─── Dedup key ─────────────────────────────────────────────────────────────

function norm(s?: string | null): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normDate(d: string): string {
  const dt = new Date(d)
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  return d.slice(0, 10)
}

function counterpartyIbanOf(r: MergeInput): string {
  return r.iban ?? r.counterpartyIban ?? ''
}

// Cross-source dedup tuning. EnableBanking books a transaction ~1 day after the
// CSV Buchungstag, so the same transaction carries a slightly different date in
// each source. We therefore match on amount + counterparty within a small date
// window (not the exact date), and — when an incoming row matches an existing
// one — keep the better-structured source. Credit card statement rows are
// itemized purchases with their own distinct amounts (never collide with the
// lump Giro settlement booking via matchKey), so their rank mostly just needs
// to be higher than a re-pulled CSV/EB row of the same purchase.
const DEDUP_TOL_DAYS = 2
const SOURCE_RANK: Record<string, number> = { csv: 1, eb: 2, creditcard: 3, traderepublic: 4 }
function rankOf(source?: string | null): number {
  return SOURCE_RANK[source ?? ''] ?? 0
}

// The same transaction across sources shares amount + counterparty. Date is
// compared separately within DEDUP_TOL_DAYS, so recurring same-amount merchants
// that are weeks apart are NOT collapsed.
function matchKey(amount: number, counterparty?: string | null): string {
  return `${Math.round(amount * 100)}|${norm(counterparty)}`
}

function dayNumber(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 86_400_000)
}

// ─── Operations ──────────────────────────────────────────────────────────────

function rowToStored(r: DbRow): StoredTx {
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
    shares: r.shares,
  }
}

async function countRows(db: D1Database): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS c FROM transactions').first<{ c: number }>()
  return r?.c ?? 0
}

// Every trade (buy/sell) with a known ISIN + share count, for reconstructing
// depot holdings over time — see traderepublic/depotHistory.ts.
export async function getTradeRows(db: D1Database): Promise<{ date: string; isin: string; shares: number }[]> {
  const { results } = await db
    .prepare('SELECT date, isin, shares FROM transactions WHERE isin IS NOT NULL AND shares IS NOT NULL ORDER BY date ASC')
    .all<{ date: string; isin: string; shares: number }>()
  return results ?? []
}

export async function getTransactions(db: D1Database): Promise<StoredTx[]> {
  // Days newest-first; within a day, insertion order (rowid ASC) so the app
  // mirrors the order the rows were imported in. Without the explicit rowid
  // tiebreaker SQLite reverse-scans idx_tx_date and flips same-day rows.
  const { results } = await db
    .prepare('SELECT * FROM transactions ORDER BY date DESC, rowid ASC')
    .all<DbRow>()
  return (results ?? []).map(rowToStored)
}

// Map raw input rows to stored rows with fresh unique ids. Pending rows are
// skipped — their booking date (and thus identity) is still volatile.
export function toStored(rows: MergeInput[], source: string): StoredTx[] {
  return rows
    .filter(r => !r.isPending && r.date)
    .map(r => ({
      id: crypto.randomUUID(),
      date: normDate(r.date),
      amount: r.amount,
      type: r.type ?? (r.amount >= 0 ? 'income' : 'expense'),
      description: r.description ?? '',
      counterparty: r.counterparty ?? '',
      iban: counterpartyIbanOf(r) || null,
      accountIban: r.accountIban ?? null,
      reference: r.reference ?? null,
      categoryId: r.categoryId ?? null,
      customLabel: r.customLabel ?? null,
      customIcon: r.customIcon ?? null,
      source,
      parentId: r.parentId ?? null,
      isin: r.isin ?? null,
      shares: r.shares ?? null,
    }))
}

// Merge a batch into the canonical store with cross-source de-duplication.
// For each incoming row we look for an existing row with the same amount +
// counterparty whose date is within DEDUP_TOL_DAYS. If found, we keep whichever
// source ranks higher — replacing the existing row when the incoming one wins
// (e.g. an EB pull supersedes the matching CSV row). Unmatched rows are
// inserted. Returns net-new count + total.
export async function mergeTransactions(
  db: D1Database,
  rows: MergeInput[],
  source: string,
): Promise<{ added: number; total: number; newlyAddedIds: string[] }> {
  const incoming = rows.filter(r => !r.isPending && r.date)

  const { results: existing } = await db
    .prepare('SELECT id, date, amount, counterparty, source, category_id, custom_label, custom_icon FROM transactions')
    .all<{ id: string; date: string; amount: number; counterparty: string; source: string | null;
           category_id: string | null; custom_label: string | null; custom_icon: string | null }>()

  type Existing = {
    id: string; day: number; source: string | null
    category_id: string | null; custom_label: string | null; custom_icon: string | null
  }
  const index = new Map<string, Existing[]>()
  // Looser fallback index keyed by amount only (no counterparty) — PayPal-routed
  // payments get resolved to different counterparty text by EnableBanking than
  // by the CSV pipeline (one masks/renames merchants differently than the
  // other), so the exact (amount, counterparty) key above never matches and
  // the same real transaction was getting inserted twice. See its use below.
  const looseIndex = new Map<number, Existing[]>()
  for (const e of existing ?? []) {
    const entry: Existing = { id: e.id, day: dayNumber(e.date), source: e.source,
               category_id: e.category_id, custom_label: e.custom_label, custom_icon: e.custom_icon }
    const k = matchKey(e.amount, e.counterparty)
    const arr = index.get(k) ?? []
    arr.push(entry)
    index.set(k, arr)
    const cents = Math.round(e.amount * 100)
    const looseArr = looseIndex.get(cents) ?? []
    looseArr.push(entry)
    looseIndex.set(cents, looseArr)
  }

  const claimed = new Set<string>()   // existing rows already matched this batch
  const toDelete: string[] = []
  const toInsertRows: MergeInput[] = []
  // Rows with no prior match at all — genuinely new to the user, as opposed to
  // a same-transaction row from a higher-ranked source replacing an existing
  // one (toDelete) — used to mark only true newcomers in the UI.
  const freshRows = new Set<MergeInput>()
  const incomingRank = rankOf(source)

  for (const r of incoming) {
    const day = dayNumber(r.date)
    const candidates = (index.get(matchKey(r.amount, r.counterparty)) ?? []).filter(c => !claimed.has(c.id))
    let best: Existing | null = null
    let bestDiff = Infinity
    for (const c of candidates) {
      const diff = Math.abs(day - c.day)
      if (diff <= DEDUP_TOL_DAYS && diff < bestDiff) { best = c; bestDiff = diff }
    }
    if (best) {
      claimed.add(best.id)
      if (incomingRank > rankOf(best.source)) {
        toDelete.push(best.id)   // incoming source wins → replace existing
        // Carry over the existing row's user/enrichment overrides so a re-pull
        // doesn't wipe them (incoming explicit values still win).
        toInsertRows.push({
          ...r,
          categoryId:  r.categoryId  ?? best.category_id  ?? undefined,
          customLabel: r.customLabel ?? best.custom_label ?? undefined,
          customIcon:  r.customIcon  ?? best.custom_icon  ?? undefined,
        })
      }
      // else: existing row wins → skip incoming
      continue
    }

    // No exact (amount + counterparty) match. For an EnableBanking pull,
    // also check for a same-amount row within the date window that a CSV
    // import already covers, just under different counterparty text — drop
    // the EB duplicate rather than inserting a near-identical second row.
    if (source === 'eb') {
      const cents = Math.round(r.amount * 100)
      const looseMatch = (looseIndex.get(cents) ?? [])
        .find(c => !claimed.has(c.id) && c.source === 'csv' && Math.abs(day - c.day) <= DEDUP_TOL_DAYS)
      if (looseMatch) {
        claimed.add(looseMatch.id)
        continue
      }
    }

    toInsertRows.push(r)
    freshRows.add(r)
  }

  const toInsert = toStored(toInsertRows, source)
  const newlyAddedIds = toInsert.filter((_, i) => freshRows.has(toInsertRows[i])).map(t => t.id)
  const now = new Date().toISOString()
  const stmts: D1PreparedStatement[] = []
  for (const id of toDelete) {
    stmts.push(db.prepare('DELETE FROM transactions WHERE id = ?').bind(id))
  }
  for (const t of toInsert) {
    stmts.push(
      db.prepare(
        `INSERT INTO transactions
           (id, date, amount, type, description, counterparty, iban, account_iban, reference, category_id, custom_label, custom_icon, source, parent_id, isin, shares, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        t.id, t.date, t.amount, t.type, t.description, t.counterparty,
        t.iban, t.accountIban, t.reference, t.categoryId, t.customLabel, t.customIcon, t.source, t.parentId,
        t.isin, t.shares, now,
      ),
    )
  }
  if (stmts.length) await db.batch(stmts)
  const total = await countRows(db)
  return { added: toInsert.length - toDelete.length, total, newlyAddedIds }
}

export async function updateTransaction(
  db: D1Database,
  id: string,
  patch: { categoryId?: string; customLabel?: string; customIcon?: string; parentId?: string },
): Promise<void> {
  const fields: string[] = []
  const vals: (string | null)[] = []
  if ('categoryId' in patch)  { fields.push('category_id=?');  vals.push(patch.categoryId  ?? null) }
  if ('customLabel' in patch) { fields.push('custom_label=?'); vals.push(patch.customLabel ?? null) }
  if ('customIcon' in patch)  { fields.push('custom_icon=?');  vals.push(patch.customIcon  ?? null) }
  if ('parentId' in patch)    { fields.push('parent_id=?');    vals.push(patch.parentId    ?? null) }
  if (!fields.length) return
  await db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id=?`).bind(...vals, id).run()
}

export async function deleteTransaction(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
}

export async function clearTransactions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM transactions').run()
}

// ─── D1 global error log ───────────────────────────────────────────────────
// Shared across devices so issues are visible regardless of which browser hit
// them. Capped — oldest rows beyond ERROR_CAP are dropped on insert.

export interface StoredError {
  id: string
  time: string
  context: string
  message: string
  stack: string | null
  device: string | null
}

interface ErrorRow {
  id: string
  time: string
  context: string
  message: string
  stack: string | null
  device: string | null
}

const ERROR_CAP = 300

export async function insertError(
  db: D1Database,
  entry: { id: string; time: string; context: string; message: string; stack?: string; device?: string },
): Promise<void> {
  const now = new Date().toISOString()
  await db.prepare(
    `INSERT INTO errors (id, time, context, message, stack, device, created_at) VALUES (?,?,?,?,?,?,?)`,
  ).bind(entry.id, entry.time, entry.context, entry.message, entry.stack ?? null, entry.device ?? null, now).run()
  await db.prepare(
    `DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY time DESC LIMIT ?)`,
  ).bind(ERROR_CAP).run()
}

export async function getErrors(db: D1Database): Promise<StoredError[]> {
  const { results } = await db
    .prepare('SELECT id, time, context, message, stack, device FROM errors ORDER BY time DESC')
    .all<ErrorRow>()
  return results ?? []
}

export async function clearErrors(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM errors').run()
}

// ─── EnableBanking session store ─────────────────────────────────────────────
//
// One row: the session created by the last successful TAN authorization.
// While it's valid, /eb/sync can fetch fresh transactions without sending the
// user through the bank's SCA flow again.

export interface EbSessionRow {
  session_id: string
  accounts: string   // JSON: account resources from the code exchange
  valid_until: string
  created_at: string
}

export async function saveEbSession(
  db: D1Database,
  entry: { sessionId: string; accountsJson: string; validUntil: string },
): Promise<void> {
  await db.prepare(
    `INSERT INTO eb_session (id, session_id, accounts, valid_until, created_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       accounts = excluded.accounts,
       valid_until = excluded.valid_until,
       created_at = excluded.created_at`,
  ).bind(entry.sessionId, entry.accountsJson, entry.validUntil, new Date().toISOString()).run()
}

export async function getEbSession(db: D1Database): Promise<EbSessionRow | null> {
  return await db
    .prepare('SELECT session_id, accounts, valid_until, created_at FROM eb_session WHERE id = 1')
    .first<EbSessionRow>()
}

export async function clearEbSession(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM eb_session WHERE id = 1').run()
}
