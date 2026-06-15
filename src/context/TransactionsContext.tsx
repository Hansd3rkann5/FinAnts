import { createContext, useContext, useEffect, useRef, useCallback } from 'react'
import { useTransactions } from '@/hooks/useTransactions'
import { useMerchantProfiles } from '@/hooks/useMerchantProfiles'
import { useCustomCategories } from '@/hooks/useCustomCategories'
import { pushCloudState, pullCloudState } from '@/utils/cloudSync'
import { reportError } from '@/utils/notify'

type TransactionsCtx =
  ReturnType<typeof useTransactions> &
  ReturnType<typeof useMerchantProfiles> &
  ReturnType<typeof useCustomCategories> &
  { refreshAll: () => Promise<void> }

const Ctx = createContext<TransactionsCtx | null>(null)

// Auto-sync custom categories + merchant patterns to the cloud blob — pull once
// on mount, then push (debounced) whenever they change. Returns a manual `pull`
// (used by pull-to-refresh) so a device that set its API key after load can
// fetch the patterns. The echo guard prevents the pull from re-pushing.
function useAutoSyncPatterns(
  customCategories: ReturnType<typeof useCustomCategories>['customCategories'],
  merchantProfiles: ReturnType<typeof useMerchantProfiles>['merchantProfiles'],
  applyCloudCategories: ReturnType<typeof useCustomCategories>['applyCloudCategories'],
  applyCloudProfiles: ReturnType<typeof useMerchantProfiles>['applyCloudProfiles'],
) {
  const hydrated = useRef(false)
  const lastSyncedJson = useRef<string | null>(null)

  const pull = useCallback(async () => {
    const state = await pullCloudState()
    if (!state) return
    applyCloudCategories(state.customCategories ?? [])
    applyCloudProfiles(state.merchantProfiles ?? [])
    lastSyncedJson.current = JSON.stringify({
      customCategories: state.customCategories ?? [],
      merchantProfiles: state.merchantProfiles ?? [],
    })
  }, [applyCloudCategories, applyCloudProfiles])

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
    const snapshot = JSON.stringify({ customCategories, merchantProfiles })
    if (snapshot === lastSyncedJson.current) return
    const t = setTimeout(() => {
      pushCloudState({ version: 1, updatedAt: new Date().toISOString(), customCategories, merchantProfiles })
        .then(() => { lastSyncedJson.current = snapshot })
        .catch(err => reportError('Sync fehlgeschlagen', err))
    }, 1200)
    return () => clearTimeout(t)
  }, [customCategories, merchantProfiles])

  return { pull }
}

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const profiles = useMerchantProfiles()
  const categories = useCustomCategories()
  // Transactions enrich against the current patterns, so build profiles first.
  const transactions = useTransactions(profiles.merchantProfiles)

  const { pull: pullPatterns } = useAutoSyncPatterns(
    categories.customCategories,
    profiles.merchantProfiles,
    categories.applyCloudCategories,
    profiles.applyCloudProfiles,
  )

  // Full cloud download: categories + merchant patterns (R2) then transactions (D1).
  const refreshAll = useCallback(async () => {
    await pullPatterns().catch(err => reportError('Sync fehlgeschlagen', err))
    await transactions.refresh()
  }, [pullPatterns, transactions])

  return (
    <Ctx.Provider value={{ ...transactions, ...profiles, ...categories, refreshAll }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTransactionsCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTransactionsCtx must be used within TransactionsProvider')
  return ctx
}
