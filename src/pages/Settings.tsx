import { useState, useCallback, useRef, useMemo } from 'react'
import { DEV_VERSION } from 'virtual:dev-version'
import { Wallet, Download, Lock } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { ChartLoader } from '@/components/ui/ChartLoader'
import { getApiKey } from '@/utils/cfAuth'
import { SettingsGroup } from '@/components/settings/shared'
import { AccessSection } from '@/components/settings/AccessSection'
import { ManualBalanceSection } from '@/components/settings/ManualBalanceSection'
import { AccountsSection } from '@/components/settings/AccountsSection'
import { CloudBackupSection } from '@/components/settings/CloudBackupSection'
import { EnableBankingSection } from '@/components/settings/EnableBankingSection'
import { CreditCardImportSection } from '@/components/settings/CreditCardImportSection'
import { TradeRepublicSection } from '@/components/settings/TradeRepublicSection'
import { CsvImportSection } from '@/components/settings/CsvImportSection'
import { AppLockSection } from '@/components/settings/AppLockSection'
import { ThemeSection } from '@/components/settings/ThemeSection'
import { DataSection } from '@/components/settings/DataSection'
import { ErrorLogSection } from '@/components/settings/ErrorLogSection'
import { MerchantProfilesSection } from '@/components/settings/MerchantProfilesSection'

export function Settings() {
  const [isAuth, setIsAuth] = useState(() => !!getApiKey())

  // Sections report their busy message here so the single page-level
  // ChartLoader overlay can show it. Keyed per section so one section
  // clearing (null) can't hide another section's still-active loader.
  const loaderMsgs = useRef(new Map<string, string>())
  const [loaderMessage, setLoaderMessage] = useState<string | undefined>(undefined)
  const makeOnLoader = useCallback((key: string) => (message: string | null) => {
    if (message === null) loaderMsgs.current.delete(key)
    else loaderMsgs.current.set(key, message)
    setLoaderMessage([...loaderMsgs.current.values()][0])
  }, [])
  const onAccessLoader = useMemo(() => makeOnLoader('access'), [makeOnLoader])
  const onEbLoader     = useMemo(() => makeOnLoader('eb'),     [makeOnLoader])
  const onCcLoader     = useMemo(() => makeOnLoader('cc'),     [makeOnLoader])
  const onCsvLoader    = useMemo(() => makeOnLoader('csv'),    [makeOnLoader])

  return (
    <>
      <ChartLoader show={loaderMessage !== undefined} message={loaderMessage} />

      <div className="flex flex-col min-h-full">
      <div className="flex-1 flex flex-col gap-3 px-4">
        <div
        id="dash-sticky-filter"
        className="sticky top-0 z-30 pt-2 mb-5"
        style={{
          backdropFilter: 'blur(5px)',
          paddingTop: '40px',
          WebkitBackdropFilter: 'blur(5px)',
          backgroundColor: 'rgba(10, 10, 20, 0.75)',
          boxShadow: '0 -4px 24px 10px rgba(10,10,10,0.8), 0 -1px 80px 10px rgba(10,10,10,0.8)',
        }}
      ></div>

        <div className="pb-6">
          <p className="relative text-center text-[30px] text-white/45 tracking-[0.2em] uppercase">
            FinAnts
          </p>
        </div>

        {/* ── Gruppe: Konten & Zugang ─────────────────────────────────────── */}
        <SettingsGroup
          icon={<Wallet size={15} className="text-white/50" />}
          title="Konten & Zugang"
          subtitle="Zugang, Kontostand, Konten, Cloud-Backup"
          defaultOpen={!isAuth}
        >
          <AccessSection isAuth={isAuth} onAuthChange={setIsAuth} onLoader={onAccessLoader} />
          <ManualBalanceSection />
          <AccountsSection />
          <CloudBackupSection isAuth={isAuth} />
        </SettingsGroup>

        {/* ── Gruppe: Daten importieren ─────────────────────────────────────── */}
        <SettingsGroup
          icon={<Download size={15} className="text-white/50" />}
          title="Daten importieren"
          subtitle="Bankabfrage, Kreditkarte, CSV-Import"
        >
          <EnableBankingSection isAuth={isAuth} onLoader={onEbLoader} />
          <CreditCardImportSection onLoader={onCcLoader} />
          <TradeRepublicSection />
          <CsvImportSection onLoader={onCsvLoader} />
        </SettingsGroup>

        {/* ── Gruppe: Sicherheit & Daten ───────────────────────────────────── */}
        <SettingsGroup
          icon={<Lock size={15} className="text-white/50" />}
          title="Sicherheit & Daten"
          subtitle="App-Sperre, Darstellung, Datenlöschung, Fehlerprotokoll"
        >
          <AppLockSection />
          <ThemeSection />
          <MerchantProfilesSection />
          <DataSection />
          <ErrorLogSection />
        </SettingsGroup>

      </div>

      {/* Pinned footer — sticks to the bottom of the scrollable viewport.
          The page-scroll container's usual pb-28 clearance (see AppShell) is
          removed for this page and absorbed here as pb-28 instead, so the
          blurred background itself extends all the way down behind the nav
          rather than leaving a plain transparent gap below the footer. */}
      <div
        className="sticky bottom-0 left-0 right-0 flex flex-col"
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          background: 'linear-gradient(to top, rgba(10,10,15,0.85) 60%, transparent)',
        }}
      >
        <GlassCard padding="sm"
        style={{
          background: 'rgb(10,10,15,0.05)',
          border: 'none',
          paddingBottom: '98px',
          paddingTop: '5px',
        }}
        >
          <button
            onClick={() => window.location.reload()}
            className="w-full text-xs text-white/20 text-center active:opacity-50 transition-opacity">
            <span className="ml-2 text-white/80 tracking-widest uppercase">FinAnts  •</span><span className="ml-2 text-white/80">{import.meta.env.DEV ? `local V${DEV_VERSION}` : `Git ${__APP_VERSION__}`}</span>
          </button>
        </GlassCard>
      </div>
      </div>
    </>
  )
}
