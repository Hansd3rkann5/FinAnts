import { useState } from 'react'
import { Bug, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { getApiKey } from '@/utils/cfAuth'
import { useErrorLog, notify, fetchErrorLogRemote, clearErrorLogRemote, type RemoteLoggedError } from '@/utils/notify'
import { CollapsibleCard } from './shared'

export function ErrorLogSection() {
  const { entries: errorLog, clear: clearErrorLog } = useErrorLog()
  const [remoteErrors, setRemoteErrors] = useState<RemoteLoggedError[] | null>(null)
  const [remoteErrorsLoading, setRemoteErrorsLoading] = useState(false)

  async function loadRemoteErrors() {
    setRemoteErrorsLoading(true)
    try {
      setRemoteErrors(await fetchErrorLogRemote())
    } catch (e) {
      notify('Globales Protokoll konnte nicht geladen werden', e instanceof Error ? e.message : '')
    } finally {
      setRemoteErrorsLoading(false)
    }
  }

  async function handleClearRemoteErrors() {
    try {
      await clearErrorLogRemote()
      setRemoteErrors([])
    } catch (e) {
      notify('Leeren fehlgeschlagen', e instanceof Error ? e.message : '')
    }
  }

  return (
    <CollapsibleCard
      icon={<Bug size={15} className="text-white/40 shrink-0" />}
      title="Fehlerprotokoll"
      statusText={errorLog.length ? `${errorLog.length} Fehler protokolliert` : 'Keine Fehler'}
    >
      {errorLog.length === 0 ? (
        <p className="text-xs text-white/40">Keine Fehler aufgezeichnet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {[...errorLog].reverse().map(e => (
              <div key={e.id} className="rounded-card_sm border border-white/8 bg-white/[0.03] p-2">
                <p className="text-[11px] font-medium text-white/70">
                  {e.context}
                  <span className="text-white/30"> · {new Date(e.time).toLocaleString('de-DE')}</span>
                </p>
                <p className="text-[11px] text-white/45 break-words">{e.message}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <PillButton
              variant="secondary"
              size="sm"
              icon={<Copy size={13} />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(JSON.stringify(errorLog, null, 2))
                  notify('Fehlerprotokoll kopiert')
                } catch { /* clipboard unavailable */ }
              }}
            >
              Kopieren
            </PillButton>
            <PillButton variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={clearErrorLog}>
              Leeren
            </PillButton>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-white/8">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-white/60 uppercase tracking-wider">Geräteübergreifend (Server)</p>
          <PillButton
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={12} className={remoteErrorsLoading ? 'animate-spin' : ''} />}
            onClick={loadRemoteErrors}
            disabled={remoteErrorsLoading || !getApiKey()}
          >
            {remoteErrors === null ? 'Laden' : 'Aktualisieren'}
          </PillButton>
        </div>
        {!getApiKey() ? (
          <p className="text-xs text-white/40">Kein API-Key hinterlegt — globales Protokoll nicht verfügbar.</p>
        ) : remoteErrors === null ? (
          <p className="text-xs text-white/40">Noch nicht geladen.</p>
        ) : remoteErrors.length === 0 ? (
          <p className="text-xs text-white/40">Keine Fehler aufgezeichnet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {remoteErrors.map(e => (
                <div key={e.id} className="rounded-card_sm border border-white/8 bg-white/[0.03] p-2">
                  <p className="text-[11px] font-medium text-white/70">
                    {e.context}
                    <span className="text-white/30"> · {new Date(e.time).toLocaleString('de-DE')}</span>
                    {e.device && <span className="text-white/30"> · {e.device.slice(0, 40)}</span>}
                  </p>
                  <p className="text-[11px] text-white/45 break-words">{e.message}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <PillButton
                variant="secondary"
                size="sm"
                icon={<Copy size={13} />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(remoteErrors, null, 2))
                    notify('Globales Protokoll kopiert')
                  } catch { /* clipboard unavailable */ }
                }}
              >
                Kopieren
              </PillButton>
              <PillButton variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={handleClearRemoteErrors}>
                Leeren
              </PillButton>
            </div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  )
}
