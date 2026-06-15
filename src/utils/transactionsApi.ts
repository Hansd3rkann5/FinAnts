// Client for the canonical transaction store (Cloudflare D1 via the worker).
// The worker stores raw bank fields + user overrides; merchant logos and
// auto-categories are derived here on load so that logic stays client-side.
import { cfHeaders } from './cfAuth'
import { autoCategory } from './categorizer'
import { findMerchant } from './merchantLogos'
import { loadWorkerConfig } from '@/hooks/useWorkerSync'
import { resolveProfile } from '@/hooks/useMerchantProfiles'
import type { Transaction, MerchantProfile } from '@/types'

const DEFAULT_WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')

function workerUrl(): string {
  return (loadWorkerConfig()?.workerUrl ?? DEFAULT_WORKER_URL).replace(/\/$/, '')
}

// Canonical row shape returned by the worker.
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

// Raw fields sent to the merge endpoint; the server derives the dedup key.
// Auto-derived categories are intentionally omitted — only explicit user edits
// (via updateTransactionRemote) are persisted as overrides.
export interface MergeRow {
  date: string
  amount: number
  type?: string
  description?: string
  counterparty?: string
  iban?: string
  accountIban?: string
  reference?: string
  isPending?: boolean
}

export interface MergeResult {
  transactions: StoredTx[]
  meta: { added: number; total: number }
}

// PayPal direct-debits arrive with "PayPal Europe …" as the counterparty, but
// the real merchant is buried in the purpose text, e.g.
//   "…/PP.1165.PP/. Takeaway.com Payments B.V., Ihr Einkauf bei Takeaway.com…"
// Extract that merchant (the token right before ", Ihr Einkauf bei"). Returns
// undefined for non-PayPal rows, empty purposes, or PayPal-to-PayPal transfers.
export function extractPaypalMerchant(counterparty?: string | null, description?: string | null): string | undefined {
  if (!/paypal/i.test(counterparty ?? '')) return undefined
  // Prefer the clean copy after the last " · " (Commerzbank joins a wrapped
  // Buchungstext with the un-wrapped Verwendungszweck); else de-wrap newlines.
  const desc = description ?? ''
  const candidates = desc.includes(' · ') ? [desc.split(' · ').pop()!, desc] : [desc]
  for (const c of candidates) {
    const text = c.replace(/[\r\n]/g, '').replace(/\s{2,}/g, ' ')
    const m = text.match(/[/.]\s+([^,]{2,}?),\s*Ihr Einkauf bei/i)
    const name = m?.[1]?.trim()
    // Reject if the capture reached back over the reference prefix (a real
    // merchant name never contains a long digit-run, "PP.####", or "PayPal").
    if (name && !/paypal/i.test(name) && !/\d{5,}/.test(name) && !/PP\.\d/i.test(name)) return name
  }
  return undefined
}

// Enrich canonical rows into Transactions, applying matching merchant patterns.
// Precedence per field: explicit per-tx D1 value → matching profile → derived
// fallback. So a pattern's icon/label/category auto-applies to every matching
// transaction (existing or newly imported) unless that row was edited directly.
// PayPal SEPA boilerplate carries no info; once a row has a real label we hide
// it. A short note (from the PayPal-history match) is kept as the description.
function cleanPaypalDescription(counterparty: string, description: string): string {
  if (!/paypal/i.test(counterparty)) return description
  if (/End-to-End|Mandatsref|Gläubiger|PP\.\d/i.test(description)) return ''
  return description
}

export function enrichTransactions(rows: StoredTx[], profiles: MerchantProfile[]): Transaction[] {
  return rows.map(r => {
    const ppMerchant = extractPaypalMerchant(r.counterparty, r.description)
    const tx: Transaction = {
      id: r.id,
      date: new Date(r.date),
      amount: r.amount,
      type: (r.type as Transaction['type']) || (r.amount >= 0 ? 'income' : 'expense'),
      description: cleanPaypalDescription(r.counterparty, r.description),
      counterparty: r.counterparty,
      iban: r.iban ?? undefined,
      reference: r.reference ?? undefined,
      categoryId: '',
      // For PayPal, look up the logo by the real merchant rather than "PayPal".
      merchantKey: findMerchant(ppMerchant ?? `${r.description} ${r.counterparty}`)?.merchantKey,
      customLabel: r.customLabel ?? undefined,
      customIcon: r.customIcon ?? undefined,
    }
    const profile = resolveProfile(tx, profiles)
    tx.categoryId  = r.categoryId  ?? profile?.categoryId ?? autoCategory(r.description, r.counterparty)
    // Bezeichnung: explicit edit → pattern → extracted PayPal merchant.
    tx.customLabel = r.customLabel ?? profile?.label      ?? ppMerchant ?? undefined
    tx.customIcon  = r.customIcon  ?? profile?.customIcon  ?? undefined
    return tx
  })
}

export function transactionToMergeRow(t: Transaction): MergeRow {
  return {
    date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
    amount: t.amount,
    type: t.type,
    description: t.description,
    counterparty: t.counterparty,
    accountIban: t.iban,   // Commerzbank CSV exports put the account-holder IBAN here
    reference: t.reference,
    isPending: t.isPending,
  }
}

export async function fetchTransactions(): Promise<StoredTx[]> {
  const res = await fetch(`${workerUrl()}/transactions`, { credentials: 'include', headers: cfHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { transactions?: StoredTx[] }
  return data.transactions ?? []
}

export async function mergeTransactions(rows: MergeRow[], source = 'csv'): Promise<MergeResult> {
  const res = await fetch(`${workerUrl()}/transactions/merge`, {
    method: 'POST', credentials: 'include', headers: cfHeaders(),
    body: JSON.stringify({ transactions: rows, source }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(e.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<MergeResult>
}

export async function updateTransactionRemote(
  id: string,
  patch: { categoryId?: string; customLabel?: string; customIcon?: string },
): Promise<void> {
  const res = await fetch(`${workerUrl()}/transactions/update`, {
    method: 'POST', credentials: 'include', headers: cfHeaders(),
    body: JSON.stringify({ id, ...patch }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function clearTransactionsRemote(): Promise<void> {
  const res = await fetch(`${workerUrl()}/transactions/clear`, {
    method: 'POST', credentials: 'include', headers: cfHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
