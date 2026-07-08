import { createContext, useContext, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTransactions } from '@/hooks/useTransactions'
import { useMerchantProfiles } from '@/hooks/useMerchantProfiles'
import { useCustomCategories } from '@/hooks/useCustomCategories'
import { useTxSplits, type Split } from '@/hooks/useTxSplits'
import { useExcludedMerchants } from '@/hooks/useExcludedMerchants'
import { useNewTransactionMarkers } from '@/hooks/useNewTransactionMarkers'
import { useAccounts } from '@/hooks/useAccounts'
import { useBudgets } from '@/hooks/useBudgets'
import { useAccountView } from '@/hooks/useAccountView'
import { pushCloudState, pullCloudState } from '@/utils/cloudSync'
import { computeCreditCardBucket } from '@/utils/creditCardBilling'
import { reportError } from '@/utils/notify'
import type { Transaction, Category } from '@/types'

// Two contexts under one provider: high-frequency transaction-shaped data
// vs. low-frequency user preferences. Components that only need one side can
// subscribe via useDataCtx()/usePrefsCtx() and skip the other's re-renders;
// useTransactionsCtx() merges both for existing call sites.
type DataCtxType =
  ReturnType<typeof useTransactions> &
  ReturnType<typeof useAccounts> &
  ReturnType<typeof useAccountView> &
  { refreshAll: (onProgress?: (msg: string) => void) => Promise<void> }

type PrefsCtxType =
  ReturnType<typeof useMerchantProfiles> &
  ReturnType<typeof useCustomCategories> &
  ReturnType<typeof useTxSplits> &
  ReturnType<typeof useExcludedMerchants> &
  ReturnType<typeof useNewTransactionMarkers> &
  ReturnType<typeof useBudgets>

const DataCtx = createContext<DataCtxType | null>(null)
const PrefsCtx = createContext<PrefsCtxType | null>(null)

// Auto-sync custom categories + merchant patterns + chart splits to the cloud
// settings blob — pull once on mount, then push (debounced) on change. Returns a
// manual `pull` (used by pull-to-refresh) so a device that set its API key after
// load can fetch them. The echo guard prevents the pull from re-pushing.
function useAutoSyncPatterns(
  customCategories: ReturnType<typeof useCustomCategories>['customCategories'],
  merchantProfiles: ReturnType<typeof useMerchantProfiles>['merchantProfiles'],
  txSplits: ReturnType<typeof useTxSplits>['txSplits'],
  excludedMerchants: ReturnType<typeof useExcludedMerchants>['excludedMerchants'],
  accounts: ReturnType<typeof useAccounts>['accounts'],
  budgets: ReturnType<typeof useBudgets>['budgets'],
  applyCloudCategories: ReturnType<typeof useCustomCategories>['applyCloudCategories'],
  applyCloudProfiles: ReturnType<typeof useMerchantProfiles>['applyCloudProfiles'],
  applyCloudSplits: ReturnType<typeof useTxSplits>['applyCloudSplits'],
  applyCloudExcludedMerchants: ReturnType<typeof useExcludedMerchants>['applyCloudExcludedMerchants'],
  applyCloudAccounts: ReturnType<typeof useAccounts>['applyCloudAccounts'],
  applyCloudBudgets: ReturnType<typeof useBudgets>['applyCloudBudgets'],
) {
  const hydrated = useRef(false)
  const lastSyncedJson = useRef<string | null>(null)

  const pull = useCallback(async () => {
    const state = await pullCloudState()
    if (!state) return
    applyCloudCategories(state.customCategories ?? [])
    applyCloudProfiles(state.merchantProfiles ?? [])
    applyCloudSplits(state.txSplits ?? {})
    applyCloudExcludedMerchants(state.excludedMerchants ?? [])
    // undefined = blob predates account sync → keep local, next push migrates it
    applyCloudAccounts(state.accounts)
    applyCloudBudgets(state.budgets)
    lastSyncedJson.current = JSON.stringify({
      customCategories: state.customCategories ?? [],
      merchantProfiles: state.merchantProfiles ?? [],
      txSplits: state.txSplits ?? {},
      excludedMerchants: state.excludedMerchants ?? [],
      accounts: state.accounts ?? [],
      budgets: state.budgets ?? [],
    })
  }, [applyCloudCategories, applyCloudProfiles, applyCloudSplits, applyCloudExcludedMerchants, applyCloudAccounts, applyCloudBudgets])

  // Pull once on mount (best-effort — may 401 before the API key is set).
  useEffect(() => {
    let active = true
    pull()
      .catch(err => { if (active) reportError('Sync fehlgeschlagen', err) })
      .finally(() => { if (active) hydrated.current = true })
    return () => { active = false }
  }, [pull])

  // Debounced push on change (only after the initial pull, and only if changed).
  useEffect(() => {
    if (!hydrated.current) return
    const snapshot = JSON.stringify({ customCategories, merchantProfiles, txSplits, excludedMerchants, accounts, budgets })
    if (snapshot === lastSyncedJson.current) return
    const t = setTimeout(() => {
      pushCloudState({ version: 1, updatedAt: new Date().toISOString(), customCategories, merchantProfiles, txSplits, excludedMerchants, accounts, budgets })
        .then(() => { lastSyncedJson.current = snapshot })
        .catch(err => reportError('Sync fehlgeschlagen', err))
    }, 1200)
    return () => clearTimeout(t)
  }, [customCategories, merchantProfiles, txSplits, excludedMerchants, accounts, budgets])

  return { pull }
}

function splitsEqual(a: Split[] | undefined, b: Split[]): boolean {
  const x = a ?? []
  if (x.length !== b.length) return false
  return x.every((s, i) => s.categoryId === b[i].categoryId && s.amount === b[i].amount)
}

// Whenever a new "Kreditkarte" Giro booking appears — via CSV import,
// EnableBanking, or PSD2, i.e. any path that pulls fresh bank data — link
// any already-imported standalone credit-card purchases that fall in its
// billing window (extracted from its own "Abrechnung vom ..." label) to it,
// the same way uploading a Mastercard CSV does. Also keeps an already-fully-
// linked bucket's splits in sync if anything about its children changes
// later (one gets deleted, recategorized, etc.) — without this, a stale
// "Remaining"/Sonstiges split could keep showing in the overview even after
// the gap it represented has actually closed. Idempotent: once the computed
// splits already match what's stored, this is a no-op, safe to re-run on
// every change.
function useAutoBucketCreditCard(
  allTransactions: Transaction[],
  customCategories: Category[],
  batchUpdateParent: (ids: string[], parentId: string) => void,
  setSplit: (id: string, parts: Split[]) => void,
) {
  useEffect(() => {
    const kreditkarte = customCategories.find(c => c.label.trim().toLowerCase() === 'kreditkarte')
    if (!kreditkarte) return
    const giroBookings = allTransactions.filter(t => t.categoryId === kreditkarte.id)
    for (const giro of giroBookings) {
      const bucket = computeCreditCardBucket(giro, allTransactions, kreditkarte.id)
      if (!bucket) continue
      if (bucket.newlyLinkedIds.length > 0) {
        batchUpdateParent(bucket.newlyLinkedIds, bucket.giroId)
      }
      if (!splitsEqual(giro.splits, bucket.splits)) {
        setSplit(bucket.giroId, bucket.splits)
      }
    }
  }, [allTransactions, customCategories, batchUpdateParent, setSplit])
}

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const profiles = useMerchantProfiles()
  const categories = useCustomCategories()
  const splits = useTxSplits()
  const excludedMerchants = useExcludedMerchants()
  const newMarkers = useNewTransactionMarkers()
  const budgetsState = useBudgets()
  const accountsState = useAccounts()
  const accountView = useAccountView(accountsState.accounts)
  // Transactions enrich against the current patterns + splits, so build those first.
  const transactions = useTransactions(profiles.merchantProfiles, splits.txSplits)

  useAutoBucketCreditCard(
    transactions.transactions,
    categories.customCategories,
    transactions.batchUpdateParent,
    splits.setSplit,
  )

  const { pull: pullPatterns } = useAutoSyncPatterns(
    categories.customCategories,
    profiles.merchantProfiles,
    splits.txSplits,
    excludedMerchants.excludedMerchants,
    accountsState.accounts,
    budgetsState.budgets,
    categories.applyCloudCategories,
    profiles.applyCloudProfiles,
    splits.applyCloudSplits,
    excludedMerchants.applyCloudExcludedMerchants,
    accountsState.applyCloudAccounts,
    budgetsState.applyCloudBudgets,
  )

  // Reconcile any UUID account IBANs with real IBANs found in the loaded
  // transactions (e.g. old CSV imports that predate the EB UUID issue).
  useEffect(() => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
    const realIbanRe = /^[A-Z]{2}\d{2}/
    for (const acct of accountsState.accounts) {
      if (!uuidRe.test(acct.iban)) continue
      const counts = new Map<string, number>()
      for (const t of transactions.transactions) {
        const iban = t.accountIban
        if (!iban || uuidRe.test(iban) || !realIbanRe.test(iban)) continue
        counts.set(iban, (counts.get(iban) ?? 0) + 1)
      }
      if (!counts.size) continue
      const realIban = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      accountsState.remapAccountIban(acct.iban, realIban)
    }
  }, [transactions.transactions, accountsState.accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Full cloud download: categories + patterns + splits (R2) then transactions (D1).
  const refreshAll = useCallback(async (onProgress?: (msg: string) => void) => {
    onProgress?.('Cloud: Kategorien & Einstellungen werden geladen…')
    await pullPatterns().catch(err => reportError('Sync fehlgeschlagen', err))
    onProgress?.('Cloud: Buchungen werden geladen…')
    await transactions.refresh()
  }, [pullPatterns, transactions])

  // Memoized so consumers only re-render when one of the hook results
  // actually changed, not on every provider render.
  const dataValue = useMemo(() => ({
    ...transactions, ...accountsState, ...accountView, refreshAll,
  }), [transactions, accountsState, accountView, refreshAll])

  const prefsValue = useMemo(() => ({
    ...profiles, ...categories, ...splits, ...excludedMerchants, ...newMarkers, ...budgetsState,
  }), [profiles, categories, splits, excludedMerchants, newMarkers, budgetsState])

  return (
    <DataCtx.Provider value={dataValue}>
      <PrefsCtx.Provider value={prefsValue}>
        {children}
      </PrefsCtx.Provider>
    </DataCtx.Provider>
  )
}

export function useDataCtx(): DataCtxType {
  const ctx = useContext(DataCtx)
  if (!ctx) throw new Error('useDataCtx must be used within TransactionsProvider')
  return ctx
}

export function usePrefsCtx(): PrefsCtxType {
  const ctx = useContext(PrefsCtx)
  if (!ctx) throw new Error('usePrefsCtx must be used within TransactionsProvider')
  return ctx
}

// Compatibility: existing call sites destructure across both contexts.
export function useTransactionsCtx(): DataCtxType & PrefsCtxType {
  const data = useDataCtx()
  const prefs = usePrefsCtx()
  return useMemo(() => ({ ...data, ...prefs }), [data, prefs])
}
