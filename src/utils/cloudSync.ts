// Pure cloud read/write for the R2 `state/user.json` blob (custom categories +
// merchant profiles). Kept free of React/context imports so both the manual
// Cloud-Backup hook and the automatic sync in TransactionsContext can use it
// without a circular dependency.
import { cfHeaders } from './cfAuth'
import { loadWorkerConfig } from '@/utils/workerConfig'
import type { Category, MerchantProfile } from '@/types'

const DEFAULT_WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')

export function cloudWorkerUrl(): string {
  return (loadWorkerConfig()?.workerUrl ?? DEFAULT_WORKER_URL).replace(/\/$/, '')
}

export interface CloudState {
  version: 1
  updatedAt: string
  customCategories: Category[]
  merchantProfiles: MerchantProfile[]
  // Chart-only category splits, keyed by transaction id (D1 rows untouched).
  txSplits?: Record<string, { categoryId: string; amount: number }[]>
  // Merchant names excluded from the Top-Händler chart/breakdown.
  excludedMerchants?: string[]
  // Retired: per-tx edits live in D1. Optional only so older backups still parse.
  txOverrides?: Record<string, { categoryId: string; customLabel?: string; customIcon?: string }>
}

export async function pushCloudState(state: CloudState): Promise<void> {
  const res = await fetch(`${cloudWorkerUrl()}/state`, {
    method: 'PUT',
    credentials: 'include',
    headers: cfHeaders(),
    body: JSON.stringify(state),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export async function pullCloudState(): Promise<CloudState | null> {
  const res = await fetch(`${cloudWorkerUrl()}/state`, {
    credentials: 'include',
    headers: cfHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<CloudState | null>
}
