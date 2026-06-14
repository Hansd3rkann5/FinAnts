// ─── D1 transaction store ────────────────────────────────────────────────────
//
// Canonical store for all transactions. The primary key is a deterministic
// dedup hash derived from the transaction's natural fields, so re-importing the
// same CSV or re-pulling the same bank window only inserts the delta.

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

function makeBase(r: MergeInput): string {
  const cents = Math.round(r.amount * 100)
  return [norm(r.accountIban), normDate(r.date), cents, norm(r.counterparty), norm(r.description)].join('|')
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
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
  const { results } = await db.prepare('SELECT * FROM transactions ORDER BY date DESC').all<DbRow>()
  return (results ?? []).map(rowToStored)
}

// Derive canonical rows (with deterministic ids) from raw input. Pending rows
// are skipped — their key changes once they book, which would otherwise leave a
// stale duplicate. Identical rows within one batch get an occurrence index so
// genuine same-day/same-amount duplicates stay distinct yet idempotent.
export async function toStored(rows: MergeInput[], source: string): Promise<StoredTx[]> {
  const persistable = rows.filter(r => !r.isPending && r.date)
  const baseCounts = new Map<string, number>()
  const out: StoredTx[] = []
  for (const r of persistable) {
    const base = makeBase(r)
    const occ = baseCounts.get(base) ?? 0
    baseCounts.set(base, occ + 1)
    const id = await sha256hex(`${base}|${occ}`)
    out.push({
      id,
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
    })
  }
  return out
}

// Insert only the delta. `meta.changes` is the number of rows actually inserted
// (0 for an ignored conflict), giving `added`.
export async function mergeTransactions(
  db: D1Database,
  rows: MergeInput[],
  source: string,
): Promise<{ added: number; total: number }> {
  const derived = await toStored(rows, source)
  const now = new Date().toISOString()

  const stmts = derived.map(t =>
    db.prepare(
      `INSERT INTO transactions
         (id, date, amount, type, description, counterparty, iban, account_iban, reference, category_id, custom_label, custom_icon, source, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(
      t.id, t.date, t.amount, t.type, t.description, t.counterparty,
      t.iban, t.accountIban, t.reference, t.categoryId, t.customLabel, t.customIcon, t.source, now,
    ),
  )

  let added = 0
  if (stmts.length) {
    const results = await db.batch(stmts)
    added = results.reduce((sum, res) => sum + (res.meta?.changes ?? 0), 0)
  }
  const total = await countRows(db)
  return { added, total }
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
