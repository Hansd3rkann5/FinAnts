import { createContext, useContext, useEffect, useRef } from 'react'
import { useTransactions } from '@/hooks/useTransactions'
import { useMerchantProfiles } from '@/hooks/useMerchantProfiles'
import { useCustomCategories } from '@/hooks/useCustomCategories'
import { pushCloudState, pullCloudState } from '@/utils/cloudSync'
import { reportError } from '@/utils/notify'

type TransactionsCtx =
  ReturnType<typeof useTransactions> &
  ReturnType<typeof useMerchantProfiles> &
  ReturnType<typeof useCustomCategories>

const Ctx = createContext<TransactionsCtx | null>(null)

// Auto-sync custom categories + merchant patterns to the cloud blob — pull once
// on mount, then push (debounced) whenever they change. Removes the need for a
// manual backup. The echo guard prevents the mount-pull from re-pushing and
// avoids loops.
function useAutoSyncPatterns(
  customCategories: ReturnType<typeof useCustomCategories>['customCategories'],
  merchantProfiles: ReturnType<typeof useMerchantProfiles>['merchantProfiles'],
  applyCloudCategories: ReturnType<typeof useCustomCategories>['applyCloudCategories'],
  applyCloudProfiles: ReturnType<typeof useMerchantProfiles>['applyCloudProfiles'],
) {
  const hydrated = useRef(false)
  const lastSyncedJson = useRef<string | null>(null)

  // Pull once on mount.
  useEffect(() => {
    let active = true
    pullCloudState()
      .then(state => {
        if (!active || !state) return
        applyCloudCategories(state.customCategories ?? [])
        applyCloudProfiles(state.merchantProfiles ?? [])
        lastSyncedJson.current = JSON.stringify({
          customCategories: state.customCategories ?? [],
          merchantProfiles: state.merchantProfiles ?? [],
        })
      })
      .catch(err => reportError('Sync fehlgeschlagen', err))
      .finally(() => { if (active) hydrated.current = true })
    return () => { active = false }
  }, [applyCloudCategories, applyCloudProfiles])

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
}

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const profiles = useMerchantProfiles()
  const categories = useCustomCategories()
  // Transactions enrich against the current patterns, so build profiles first.
  const transactions = useTransactions(profiles.merchantProfiles)

  useAutoSyncPatterns(
    categories.customCategories,
    profiles.merchantProfiles,
    categories.applyCloudCategories,
    profiles.applyCloudProfiles,
  )

  return <Ctx.Provider value={{ ...transactions, ...profiles, ...categories }}>{children}</Ctx.Provider>
}

export function useTransactionsCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTransactionsCtx must be used within TransactionsProvider')
  return ctx
}
