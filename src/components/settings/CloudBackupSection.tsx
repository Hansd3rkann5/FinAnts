import { AnimatePresence } from 'framer-motion'
import { Cloud, CloudUpload, CloudDownload } from 'lucide-react'
import { PillButton } from '@/components/ui/PillButton'
import { useCloudSync } from '@/hooks/useCloudState'
import { CollapsibleCard, StatusBanner, workerCfg } from './shared'

export function CloudBackupSection({ isAuth }: { isAuth: boolean }) {
  const { push: cloudPush, pull: cloudPull, status: cloudStatus, message: cloudMessage, lastSync: cloudLastSync } =
    useCloudSync()

  return (
    <CollapsibleCard
      icon={<Cloud size={15} className="text-blue-400 shrink-0" />}
      title="Cloud-Backup"
      statusText={cloudLastSync ? `Zuletzt: ${cloudLastSync}` : 'Kategorien & Profile geräteübergreifend sichern'}
    >
      <p className="text-xs text-white/40 mb-4">
        Kategorien, Händler-Profile und Icons geräteübergreifend sichern.
      </p>
      <div className="flex gap-2">
        <PillButton
          variant="secondary"
          size="sm"
          disabled={!isAuth || cloudStatus === 'pushing' || cloudStatus === 'pulling'}
          icon={<CloudUpload size={13} className={cloudStatus === 'pushing' ? 'animate-pulse' : ''} />}
          onClick={() => cloudPush(workerCfg)}
        >
          {cloudStatus === 'pushing' ? 'Lädt…' : 'Hochladen'}
        </PillButton>
        <PillButton
          variant="secondary"
          size="sm"
          disabled={!isAuth || cloudStatus === 'pushing' || cloudStatus === 'pulling'}
          icon={<CloudDownload size={13} className={cloudStatus === 'pulling' ? 'animate-pulse' : ''} />}
          onClick={() => cloudPull(workerCfg)}
        >
          {cloudStatus === 'pulling' ? 'Lädt…' : 'Herunterladen'}
        </PillButton>
      </div>
      <AnimatePresence>
        {(cloudStatus === 'success' || cloudStatus === 'error') && (
          <div className="mt-3">
            <StatusBanner status={cloudStatus} message={cloudMessage} />
          </div>
        )}
      </AnimatePresence>
      {cloudLastSync && (
        <p className="text-[10px] text-white/25 text-center mt-2">Zuletzt: {cloudLastSync}</p>
      )}
    </CollapsibleCard>
  )
}
