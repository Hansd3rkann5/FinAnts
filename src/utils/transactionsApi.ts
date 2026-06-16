// Client for the canonical transaction store (Cloudflare D1 via the worker).
// The worker stores raw bank fields + user overrides; merchant logos and
// auto-categories are derived here on load so that logic stays client-side.
import { cfHeaders } from './cfAuth'
import { autoCategory } from './categorizer'
import { findMerchant } from './merchantLogos'
import { loadWorkerConfig } from '@/hooks/useWorkerSync'
import { resolveProfile } from '@/hooks/useMerchantProfiles'
import type { SplitMap } from '@/hooks/useTxSplits'
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

export function enrichTransactions(rows: StoredTx[], profiles: MerchantProfile[], splits: SplitMap = {}): Transaction[] {
  return rows.map(r => {
    const ppMerchant = extractPaypalMerchant(r.counterparty, r.description)
    const split = splits[r.id]
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
      // Expose the merchant name as the Bezeichnung up front so resolveProfile
      // can match patterns against it (the final value is set again below).
      customLabel: r.customLabel ?? ppMerchant ?? undefined,
      customIcon: r.customIcon ?? undefined,
    }
    const profile = resolveProfile(tx, profiles)
    tx.categoryId  = r.categoryId  ?? profile?.categoryId ?? autoCategory(r.description, r.counterparty)
    // Bezeichnung: explicit edit → pattern → extracted PayPal merchant.
    tx.customLabel = r.customLabel ?? profile?.label      ?? ppMerchant ?? undefined
    tx.customIcon  = r.customIcon  ?? profile?.customIcon  ?? undefined
    tx.splits = split && split.length ? split : undefined   // chart-only category split overlay
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

function norm(s?: string | null): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normDate(d: string): string {
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d.slice(0, 10) : dt.toISOString().slice(0, 10)
}

function matchKey(amount: number, counterparty?: string | null): string {
  return `${Math.round(amount * 100)}|${norm(counterparty)}`
}

function dayNum(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 86_400_000)
}

const DEDUP_TOL_DAYS = 2

// Client-side merge for local-only import (no API key). Mirrors the worker's
// dedup logic: same amount + counterparty within DEDUP_TOL_DAYS collapses to
// the existing row. New rows get a random id and are prepended, sorted newest-first.
export function mergeLocal(existing: StoredTx[], incoming: MergeRow[]): MergeResult {
  const filtered = incoming.filter(r => !r.isPending && r.date)

  const index = new Map<string, { id: string; day: number }[]>()
  for (const e of existing) {
    const k = matchKey(e.amount, e.counterparty)
    const arr = index.get(k) ?? []
    arr.push({ id: e.id, day: dayNum(e.date) })
    index.set(k, arr)
  }

  const claimed = new Set<string>()
  const toAdd: StoredTx[] = []

  for (const r of filtered) {
    const date = normDate(r.date)
    const day = dayNum(date)
    const candidates = (index.get(matchKey(r.amount, r.counterparty)) ?? []).filter(c => !claimed.has(c.id))
    let best: { id: string; day: number } | null = null
    let bestDiff = Infinity
    for (const c of candidates) {
      const diff = Math.abs(day - c.day)
      if (diff <= DEDUP_TOL_DAYS && diff < bestDiff) { best = c; bestDiff = diff }
    }
    if (best) {
      claimed.add(best.id)
    } else {
      toAdd.push({
        id: crypto.randomUUID(),
        date,
        amount: r.amount,
        type: r.type ?? (r.amount >= 0 ? 'income' : 'expense'),
        description: r.description ?? '',
        counterparty: r.counterparty ?? '',
        iban: r.iban ?? null,
        accountIban: r.accountIban ?? null,
        reference: r.reference ?? null,
        categoryId: null,
        customLabel: null,
        customIcon: null,
        source: 'csv',
      })
    }
  }

  const merged = [...toAdd, ...existing].sort((a, b) => b.date.localeCompare(a.date))
  return { transactions: merged, meta: { added: toAdd.length, total: merged.length } }
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

export async function deleteTransactionRemote(id: string): Promise<void> {
  const res = await fetch(`${workerUrl()}/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'include', headers: cfHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function clearTransactionsRemote(): Promise<void> {
  const res = await fetch(`${workerUrl()}/transactions/clear`, {
    method: 'POST', credentials: 'include', headers: cfHeaders(),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
