import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingDown, TrendingUp, RefreshCw, ChevronDown, ChevronUp,
  Landmark, Pencil, BarChart2, ShoppingBag, TrendingUp as TrendIcon,
  Calendar, PieChart,
} from 'lucide-react'
import type { TimeFilter, Transaction } from '@/types'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { useFilteredTransactions, useBalanceSummary } from '@/hooks/useFilteredTransactions'
import { useManualBalance } from '@/hooks/useManualBalance'
import { useAllCategories } from '@/hooks/useAllCategories'
import { isExcluded } from '@/data/categories'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useChartFilter } from '@/hooks/useChartFilter'
import {
  computeMonthlyData, computeSpendingData,
  computeCategoryTrends, computeTopMerchants, computeMerchantBreakdown, filterByTimeFilter,
  computeAvailablePeriods,
} from '@/utils/chartCompute'
import { filterTransactionsByAccounts } from '@/utils/accountFilter'
import { GlassCard } from '@/components/ui/GlassCard'
import { TimeFilterBar } from '@/components/ui/TimeFilterBar'
import { ChartHeader, CollapsibleBody, CollapsibleHeader } from '@/components/ui/ChartHeader'
import { CategoryPieChart } from '@/components/charts/CategoryPieChart'
import { MonthlyBarChart } from '@/components/charts/MonthlyBarChart'
import { SpendingAreaChart } from '@/components/charts/SpendingAreaChart'
import { CategoryTrendChart } from '@/components/charts/CategoryTrendChart'
import { TopMerchantsBar } from '@/components/charts/TopMerchantsBar'
import { CategoryManageModal } from '@/components/ui/CategoryManageModal'
import { CategoryBreakdownModal } from '@/components/ui/CategoryBreakdownModal'
import { MerchantBreakdownModal } from '@/components/ui/MerchantBreakdownModal'
import { RecurringModal } from '@/components/ui/RecurringModal'
import { AccountCard } from '@/components/ui/AccountCard'
import { AccountDetailModal } from '@/components/ui/AccountDetailModal'

import { BudgetsPanel } from '@/components/ui/BudgetsPanel'
import { DepotChart } from '@/components/charts/DepotChart'
import { TRADE_REPUBLIC_IBAN } from '@/utils/tradeRepublicParser'
import { TransactionDetailModal } from '@/components/transactions/TransactionDetailModal'
import { formatEur } from '@/utils/format'


function StatPill({ label, value, sub, color = 'text-white/80' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] text-white/35 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${color} leading-tight`}>{value}</p>
      {sub && <p className="text-[10px] text-white/25 mt-0.5">{sub}</p>}
    </div>
  )
}

export function Dashboard() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(
    () => (localStorage.getItem('dash-time-filter') as TimeFilter) ?? 'all'
  )

  function handleTimeFilter(v: TimeFilter) {
    setTimeFilter(v)
    localStorage.setItem('dash-time-filter', v)
  }

  const [showAccounts,    setShowAccounts]    = useState(false)
  const [detailAccount,   setDetailAccount]   = useState<typeof accounts[number] | null>(null)
  const [catManageOpen,   setCatManageOpen]   = useState(false)
  const [catBreakdownOpen, setCatBreakdownOpen] = useState(false)
  const [merchBreakdownOpen, setMerchBreakdownOpen] = useState(false)
  const [recurringOpen,   setRecurringOpen]   = useState(false)
  const [selectedTx,      setSelectedTx]      = useState<Transaction | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────
  const {
    transactions, recurringGroups, updateTransaction, excludedMerchants,
    accounts, totalWealth, selectedAccountIbans, isAccountSelected, toggleAccount,
  } = useTransactionsCtx()
  const { baseBalance, savedAt: balanceSavedAt, updatedAt: balanceUpdatedAt, knownIds: balanceKnownIds } = useManualBalance()
  const { allMap } = useAllCategories()

  // Everything below derives from this, not the raw context `transactions`,
  // so the whole page reflects whichever account(s) are toggled on in the
  // new Kontostand-replacement card — "all" by default (selectedAccountIbans
  // === null), same as before this feature existed.
  const accountTransactions = useMemo(
    () => filterTransactionsByAccounts(transactions, accounts, selectedAccountIbans),
    [transactions, accounts, selectedAccountIbans],
  )

  const filtered = useFilteredTransactions(accountTransactions, timeFilter)
  const summary  = useBalanceSummary(filtered)
  const analytics = useAnalytics(accountTransactions)

  // Adjust the manual balance by the booked transactions that happened after
  // it was saved. Booking dates have no time of day, so a plain timestamp
  // cutoff would miss same-day transactions synced *after* the save — when the
  // save recorded which transactions were already known (knownIds), count
  // everything from the save day onward that wasn't known yet instead. Old
  // saves without a snapshot keep the previous timestamp-cutoff behavior.
  const manualBalance = (() => {
    if (baseBalance === null || balanceSavedAt === null) return null
    const savedTs = new Date(balanceSavedAt).getTime()
    const known = balanceKnownIds !== null ? new Set(balanceKnownIds) : null
    const cutoff = known ? new Date(savedTs).setHours(0, 0, 0, 0) : savedTs
    const delta = accountTransactions
      .filter(t => !t.isPending && !isExcluded(t) && t.date.getTime() >= cutoff && !known?.has(t.id))
      .reduce((s, t) => s + t.amount, 0)
    return baseBalance + delta
  })()

  // Transactions counted on top of the saved manual balance — giro-only:
  // only transactions attributed to the giro account (by accountIban or by
  // default fallback), so TR buys/sells don't skew the breakdown.
  const giroDeltaTransactions = useMemo(() => {
    if (baseBalance === null || balanceSavedAt === null) return []
    const savedTs = new Date(balanceSavedAt).getTime()
    const known = balanceKnownIds !== null ? new Set(balanceKnownIds) : null
    const cutoff = known ? new Date(savedTs).setHours(0, 0, 0, 0) : savedTs
    const giroIban = accounts.find(a => a.type === 'giro')?.iban
    return transactions.filter(t => {
      const acctIban = t.accountIban ?? giroIban
      return acctIban === giroIban
        && !t.isPending
        && !isExcluded(t)
        && t.date.getTime() >= cutoff
        && !known?.has(t.id)
    })
  }, [baseBalance, balanceSavedAt, balanceKnownIds, transactions, accounts])

  // The manual Kontostand replaces the giro balance whenever it is fresher
  // than the bank sync: either the sync never delivered a balance (0 / no
  // date) or the user saved the manual value after the last sync. A newer
  // sync takes over again automatically.
  const giroOverride = useMemo(() => {
    if (manualBalance === null || balanceSavedAt === null) return null
    const giro = accounts.find(a => a.type === 'giro')
    if (!giro) return null
    const manualTs = new Date(balanceSavedAt).getTime()
    const syncTs = giro.balanceDate ? new Date(giro.balanceDate).getTime() : 0
    if (giro.balance !== 0 && syncTs >= manualTs) return null
    return { iban: giro.iban, prevBalance: giro.balance, included: giro.included, balance: manualBalance }
  }, [accounts, manualBalance, balanceSavedAt])

  const effectiveWealth = useMemo(() => {
    if (!giroOverride || !giroOverride.included) return totalWealth
    return totalWealth - giroOverride.prevBalance + giroOverride.balance
  }, [totalWealth, giroOverride])

  // ── Per-chart filters ─────────────────────────────────────────────────────
  const pieChart = useChartFilter(timeFilter)
  const mbChart  = useChartFilter(timeFilter)
  const saChart  = useChartFilter(timeFilter)
  const catChart = useChartFilter(timeFilter)
  const topChart = useChartFilter(timeFilter)

  // ── Per-panel collapse state (keyed by chartId) ───────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleCollapse = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))

  // ── Per-chart data ────────────────────────────────────────────────────────
  const pieFiltered = useMemo(
    () => filterByTimeFilter(accountTransactions, pieChart.effectiveFilter),
    [accountTransactions, pieChart.effectiveFilter],
  )
  const pieSummary = useBalanceSummary(pieFiltered)

  const monthlyBarData = useMemo(
    () => computeMonthlyData(accountTransactions, mbChart.effectiveFilter),
    [accountTransactions, mbChart.effectiveFilter],
  )

  const spendingData = useMemo(
    () => computeSpendingData(accountTransactions, saChart.effectiveFilter),
    [accountTransactions, saChart.effectiveFilter],
  )

  const { points: catTrendPoints, topCats } = useMemo(
    () => computeCategoryTrends(accountTransactions, catChart.effectiveFilter),
    [accountTransactions, catChart.effectiveFilter],
  )

  const excludedMerchantSet = useMemo(() => new Set(excludedMerchants), [excludedMerchants])
  const topMerchants = useMemo(
    () => computeTopMerchants(accountTransactions, topChart.effectiveFilter, excludedMerchantSet),
    [accountTransactions, topChart.effectiveFilter, excludedMerchantSet],
  )
  const merchantCount = useMemo(
    () => computeMerchantBreakdown(accountTransactions, topChart.effectiveFilter).filter(e => !excludedMerchantSet.has(e.name)).length,
    [accountTransactions, topChart.effectiveFilter, excludedMerchantSet],
  )

  // Available periods for time pickers (derived from the selected accounts' transactions)
  const periods = useMemo(() => computeAvailablePeriods(accountTransactions), [accountTransactions])

  // Summary stats (always last 12 months, unaffected by chart filters)
  const summaryMonthly = useMemo(() => computeMonthlyData(accountTransactions, 'year'), [accountTransactions])
  const filledMonths = summaryMonthly.filter(m => m.expenses > 0 || m.income > 0)
  const bestMonth = filledMonths.length
    ? filledMonths.reduce((b, m) => m.balance > b.balance ? m : b)
    : null

  // ── Account-balance cards layout ────────────────────────────────────────────
  // Once real accounts are connected, the Gesamtvermögen card (with its
  // account toggle list) replaces the manual-balance Kontostand card.
  const hasAccounts = accounts.length > 0

  const accountsToggle = (
    <motion.button
      type="button"
      onClick={() => setShowAccounts(v => !v)}
      className="ml-auto text-white/30 hover:text-white/60 flex items-center gap-1 text-[10px]"
      whileTap={{ scale: 0.95 }}
    >
      {accounts.length} {accounts.length === 1 ? 'Konto' : 'Konten'}
      {showAccounts ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
    </motion.button>
  )

  const accountsList = (
    <AnimatePresence>
      {showAccounts && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div id="accounts-list" className="flex flex-col gap-2 pt-1">
            {accounts.map(a => (
              <AccountCard
                key={a.iban}
                account={{
                  ...a,
                  included: isAccountSelected(a.iban),
                  balance: giroOverride?.iban === a.iban ? giroOverride.balance : a.balance,
                  balanceDate: giroOverride?.iban === a.iban && balanceSavedAt ? balanceSavedAt : a.balanceDate,
                }}
                onToggle={toggleAccount}
                showToggle
                onLongPress={() => setDetailAccount(a)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div id="page-dashboard" className="flex flex-col gap-4">
      <div
        id="dash-sticky-filter"
        className="sticky top-0 z-30 pt-2"
        style={{
          paddingTop: '60px',
          WebkitBackdropFilter: 'blur(5px)',
          backgroundColor: 'rgba(10, 10, 20, 0.75)',
          boxShadow: '0 -4px 24px 10px rgba(10,10,10,0.8), 0 -1px 80px 10px rgba(10,10,10,0.8)',
          borderRadius: '20px'
        }}
      >
        <TimeFilterBar value={timeFilter} onChange={handleTimeFilter} id="dash" periods={periods} />

        {/* ── Gesamtvermögen — bleibt zusammen mit dem Filter sticky ───────── */}
        <div className="mt-4">
        {hasAccounts ? (
        <>
          <GlassCard id="card-wealth" glow="purple" >
            <div className="flex items-center gap-2 mb-1">
              <Landmark size={14} className="text-purple-400" />
              <p className="text-xs text-white/40">Gesamtvermögen</p>
              {accountsToggle}
            </div>
            <motion.p
              key={effectiveWealth}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className={`text-3xl font-bold ${effectiveWealth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {formatEur(effectiveWealth, 2)}
            </motion.p>

            {accountsList}
          </GlassCard>
        </>
      ) : manualBalance !== null && (
        <GlassCard id="card-manual-balance" glow="purple" >
          <div className="flex items-center gap-2 mb-1">
            <Landmark size={14} className="text-purple-400" />
            <p className="text-xs text-white/40">Kontostand</p>
            {balanceUpdatedAt && (
              <p className="ml-auto text-[10px] text-white/25">Stand: {balanceUpdatedAt}</p>
            )}
          </div>
          <motion.p
            key={manualBalance}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className={`text-3xl font-bold ${manualBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {formatEur(manualBalance, 2)}
          </motion.p>
        </GlassCard>
      )}
        </div>
      </div>

      {/* ── Einnahmen / Ausgaben stats ──────────────────────────────────── */}
      <div id="stats-row" className="grid grid-cols-2 gap-3">
        <GlassCard id="card-income-stat" padding="sm" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card_sm bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-[10px] text-white/40">Einnahmen</p>
            <p className="text-sm font-semibold text-emerald-400">{formatEur(summary.totalIncome, 0)}</p>
          </div>
        </GlassCard>
        <GlassCard id="card-expense-stat" padding="sm" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card_sm bg-red-500/10 flex items-center justify-center text-red-400">
            <TrendingDown size={18} />
          </div>
          <div>
            <p className="text-[10px] text-white/40">Ausgaben</p>
            <p className="text-sm font-semibold text-white/80">{formatEur(summary.totalExpenses, 0)}</p>
          </div>
        </GlassCard>
      </div>

      {/* ── Depot-Verlauf (nur wenn Trade-Republic-Konto gewählt) ─────────── */}
      {hasAccounts && accounts.some(a => a.iban === TRADE_REPUBLIC_IBAN) && isAccountSelected(TRADE_REPUBLIC_IBAN) && (
        <DepotChart globalFilter={timeFilter} periods={periods} />
      )}

      {/* ── Kategorien (Pie) ─────────────────────────────────────────────── */}
      <GlassCard id="card-categories">
        <ChartHeader
          chartId="categories"
          icon={<PieChart size={14} className="text-pink-400" />}
          title="Kategorien"
          synced={pieChart.synced}
          effectiveFilter={pieChart.effectiveFilter}
          onSyncToggle={pieChart.toggleSync}
          onFilterChange={pieChart.setFilter}
          periods={periods}
          collapsible
          collapsed={collapsed['categories']}
          onToggleCollapse={() => toggleCollapse('categories')}
          extra={
            <button
              id="btn-manage-categories"
              onClick={() => setCatManageOpen(true)}
              className="w-6 h-6 rounded-full bg-white/6 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors active:scale-90 shrink-0"
            >
              <Pencil size={11} />
            </button>
          }
        />

        <CollapsibleBody collapsed={!!collapsed['categories']}>
          {pieSummary.categories.length > 0 ? (
            <CategoryPieChart categories={pieSummary.categories} />
          ) : (
            <div id="categories-empty-state" className="flex flex-col items-center gap-2 py-8 text-white/25">
              <span className="text-2xl">📊</span>
              <p className="text-xs">Noch keine Ausgaben im Zeitraum</p>
            </div>
          )}
          <button
            id="btn-category-breakdown"
            onClick={() => setCatBreakdownOpen(true)}
            className="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors pt-3 mt-1 border-t border-white/6"
          >
            {`Alle anzeigen (${new Set(accountTransactions.map(t => t.categoryId)).size})`}
          </button>
        </CollapsibleBody>
      </GlassCard>

      {/* ── Budgets (per-category monthly limits) ───────────────────────── */}
      <BudgetsPanel transactions={accountTransactions} />

      {/* ── Analytics (only when enough data) ───────────────────────────── */}
      {analytics.hasEnoughData && (
        <>
          {/* Monatlicher Verlauf */}
          <GlassCard id="card-monthly-bar">
            <ChartHeader
              chartId="monthly-bar"
              icon={<BarChart2 size={14} className="text-purple-400" />}
              title="Verlauf"
              synced={mbChart.synced}
              effectiveFilter={mbChart.effectiveFilter}
              onSyncToggle={mbChart.toggleSync}
              onFilterChange={mbChart.setFilter}
              periods={periods}
              collapsible
              collapsed={collapsed['monthly-bar']}
              onToggleCollapse={() => toggleCollapse('monthly-bar')}
            />
            <CollapsibleBody collapsed={!!collapsed['monthly-bar']}>
              <MonthlyBarChart data={monthlyBarData} />
              <div className="flex gap-4 justify-center mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400/70" />
                  <span className="text-[10px] text-white/35">Einnahmen</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-400/70" />
                  <span className="text-[10px] text-white/35">Ausgaben</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-px bg-white/30" />
                  <span className="text-[10px] text-white/35">Saldo</span>
                </div>
              </div>
            </CollapsibleBody>
          </GlassCard>

          {/* Statistiken Highlights */}
          <GlassCard id="card-stats-highlights" padding="sm" >
            <div className="flex gap-1 divide-x divide-white/6">
              <div className="flex-1 px-3 py-1">
                <StatPill
                  label="Ø Monatsausgaben"
                  value={formatEur(analytics.avgMonthlyExpenses, 0)}
                  color="text-white/80"
                />
              </div>
              {analytics.currentMonthSavingsRate !== null && (
                <div className="flex-1 px-3 py-1">
                  <StatPill
                    label="Sparquote (akt. Monat)"
                    value={`${analytics.currentMonthSavingsRate.toFixed(0)} %`}
                    sub={analytics.lastMonthSavingsRate !== null
                      ? `Vormonat: ${analytics.lastMonthSavingsRate.toFixed(0)} %`
                      : undefined}
                    color={analytics.currentMonthSavingsRate > 10 ? 'text-emerald-400' : 'text-white/80'}
                  />
                </div>
              )}
              {bestMonth && (
                <div className="flex-1 px-3 py-1">
                  <StatPill
                    label="Bester Monat"
                    value={bestMonth.month}
                    sub={`+${formatEur(bestMonth.balance, 0)}`}
                    color="text-emerald-400"
                  />
                </div>
              )}
            </div>
          </GlassCard>

          {/* Ausgaben im Überblick */}
          {spendingData.length >= 2 && (
            <GlassCard id="card-spending-area" >
              <ChartHeader
                chartId="spending-area"
                icon={<Calendar size={14} className="text-blue-400" />}
                title="Ausgaben"
                synced={saChart.synced}
                effectiveFilter={saChart.effectiveFilter}
                onSyncToggle={saChart.toggleSync}
                onFilterChange={saChart.setFilter}
                periods={periods}
                collapsible
                collapsed={collapsed['spending-area']}
                onToggleCollapse={() => toggleCollapse('spending-area')}
              />
              <CollapsibleBody collapsed={!!collapsed['spending-area']}>
                <SpendingAreaChart data={spendingData} timeFilter={saChart.effectiveFilter} />
              </CollapsibleBody>
            </GlassCard>
          )}

          {/* Kategorie-Entwicklung */}
          {topCats.length >= 2 && (
            <GlassCard id="card-category-trends" >
              <ChartHeader
                chartId="category-trends"
                icon={<TrendIcon size={14} className="text-orange-400" />}
                title="Kategorie-Entwicklung"
                synced={catChart.synced}
                effectiveFilter={catChart.effectiveFilter}
                onSyncToggle={catChart.toggleSync}
                onFilterChange={catChart.setFilter}
                periods={periods}
                collapsible
                collapsed={collapsed['category-trends']}
                onToggleCollapse={() => toggleCollapse('category-trends')}
              />
              <CollapsibleBody collapsed={!!collapsed['category-trends']}>
                <CategoryTrendChart
                  points={catTrendPoints}
                  topCats={topCats}
                  allMap={allMap}
                />
              </CollapsibleBody>
            </GlassCard>
          )}

          {/* Top Händler */}
          {topMerchants.length >= 2 && (
            <GlassCard id="card-top-merchants" >
              <ChartHeader
                chartId="top-merchants"
                icon={<ShoppingBag size={14} className="text-yellow-400" />}
                title="Top Händler"
                synced={topChart.synced}
                effectiveFilter={topChart.effectiveFilter}
                onSyncToggle={topChart.toggleSync}
                onFilterChange={topChart.setFilter}
                periods={periods}
                collapsible
                collapsed={collapsed['top-merchants']}
                onToggleCollapse={() => toggleCollapse('top-merchants')}
              />
              <CollapsibleBody collapsed={!!collapsed['top-merchants']}>
                <TopMerchantsBar merchants={topMerchants} allMap={allMap} />
                <button
                  id="btn-merchant-breakdown"
                  onClick={() => setMerchBreakdownOpen(true)}
                  className="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors pt-3 mt-3 border-t border-white/6"
                >
                  {`Alle anzeigen (${merchantCount})`}
                </button>
              </CollapsibleBody>
            </GlassCard>
          )}
        </>
      )}

      {/* ── Daueraufträge ─────────────────────────────────────────────────── */}
      {recurringGroups.length > 0 && (
        <GlassCard id="card-recurring" glow="purple" >
          <CollapsibleHeader
            icon={<RefreshCw size={14} className="text-purple-400" />}
            title="Daueraufträge erkannt"
            collapsed={!!collapsed['recurring']}
            onToggle={() => toggleCollapse('recurring')}
            right={<span className="text-xs text-white/30">{recurringGroups.length}</span>}
          />
          <CollapsibleBody collapsed={!!collapsed['recurring']}>
            <div id="recurring-list" className="flex flex-col gap-2">
              {recurringGroups.slice(0, 4).map(g => (
                <div key={g.id} data-component="recurring-row" className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/80 truncate max-w-45">{g.counterparty}</p>
                    <p className="text-[10px] text-purple-400/70 capitalize">{
                      { weekly: 'Wöchentlich', monthly: 'Monatlich', quarterly: 'Quartalsweise', yearly: 'Jährlich' }[g.frequency]
                    }</p>
                  </div>
                  <p className={`text-sm font-semibold ${g.approximateAmount < 0 ? 'text-white/70' : 'text-emerald-400'}`}>
                    {g.approximateAmount < 0 ? '' : '+'}{formatEur(g.approximateAmount, 0)}
                  </p>
                </div>
              ))}
            </div>
            <button
              id="btn-recurring-all"
              onClick={() => setRecurringOpen(true)}
              className="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors pt-3 mt-2 border-t border-white/6"
            >
              {recurringGroups.length > 4 ? `Alle anzeigen (+${recurringGroups.length - 4})` : 'Alle anzeigen'}
            </button>
          </CollapsibleBody>
        </GlassCard>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <CategoryManageModal open={catManageOpen} onClose={() => setCatManageOpen(false)} />
      <CategoryBreakdownModal
        open={catBreakdownOpen}
        onClose={() => setCatBreakdownOpen(false)}
        onTransactionSelect={setSelectedTx}
        filter={pieChart.effectiveFilter}
      />
      <MerchantBreakdownModal
        open={merchBreakdownOpen}
        onClose={() => setMerchBreakdownOpen(false)}
        onTransactionSelect={setSelectedTx}
        filter={topChart.effectiveFilter}
      />
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onUpdate={(id, patch) => {
          updateTransaction(id, patch)
          setSelectedTx(prev => prev ? { ...prev, ...patch } : null)
        }}
      />
      <RecurringModal open={recurringOpen} onClose={() => setRecurringOpen(false)} />
      {detailAccount && (
        <AccountDetailModal
          open={!!detailAccount}
          onClose={() => setDetailAccount(null)}
          account={detailAccount}
          breakdown={baseBalance !== null && balanceSavedAt !== null ? {
            baseBalance,
            savedAt: balanceSavedAt,
            deltaTransactions: giroDeltaTransactions,
          } : undefined}
        />
      )}
    </div>
  )
}
