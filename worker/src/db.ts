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
// one — keep the better-structured source (EB > FinTS > CSV).
const DEDUP_TOL_DAYS = 2
const SOURCE_RANK: Record<string, number> = { csv: 1, fints: 2, eb: 3 }
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
  }
}

async function countRows(db: D1Database): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS c FROM transactions').first<{ c: number }>()
  return r?.c ?? 0
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
): Promise<{ added: number; total: number }> {
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
  for (const e of existing ?? []) {
    const k = matchKey(e.amount, e.counterparty)
    const arr = index.get(k) ?? []
    arr.push({ id: e.id, day: dayNumber(e.date), source: e.source,
               category_id: e.category_id, custom_label: e.custom_label, custom_icon: e.custom_icon })
    index.set(k, arr)
  }

  const claimed = new Set<string>()   // existing rows already matched this batch
  const toDelete: string[] = []
  const toInsertRows: MergeInput[] = []
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
    } else {
      toInsertRows.push(r)
    }
  }

  const toInsert = toStored(toInsertRows, source)
  const now = new Date().toISOString()
  const stmts: D1PreparedStatement[] = []
  for (const id of toDelete) {
    stmts.push(db.prepare('DELETE FROM transactions WHERE id = ?').bind(id))
  }
  for (const t of toInsert) {
    stmts.push(
      db.prepare(
        `INSERT INTO transactions
           (id, date, amount, type, description, counterparty, iban, account_iban, reference, category_id, custom_label, custom_icon, source, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        t.id, t.date, t.amount, t.type, t.description, t.counterparty,
        t.iban, t.accountIban, t.reference, t.categoryId, t.customLabel, t.customIcon, t.source, now,
      ),
    )
  }
  if (stmts.length) await db.batch(stmts)
  const total = await countRows(db)
  return { added: toInsert.length - toDelete.length, total }
}

export async function updateTransaction(
  db: D1Database,
  id: string,
  patch: { categoryId?: string; customLabel?: string; customIcon?: string },
): Promise<void> {
  const fields: string[] = []
  const vals: (string | null)[] = []
  if ('categoryId' in patch)  { fields.push('category_id=?');  vals.push(patch.categoryId  ?? null) }
  if ('customLabel' in patch) { fields.push('custom_label=?'); vals.push(patch.customLabel ?? null) }
  if ('customIcon' in patch)  { fields.push('custom_icon=?');  vals.push(patch.customIcon  ?? null) }
  if (!fields.length) return
  await db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id=?`).bind(...vals, id).run()
}

export async function clearTransactions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM transactions').run()
}
