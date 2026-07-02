import { Wallet } from 'lucide-react'
import { AccountCard } from '@/components/ui/AccountCard'
import { useTransactionsCtx } from '@/context/TransactionsContext'
import { CollapsibleCard } from './shared'

export function AccountsSection() {
  const { accounts, toggleIncluded } = useTransactionsCtx()
  if (accounts.length === 0) return null
  return (
    <CollapsibleCard
      icon={<Wallet size={15} className="text-white/40 shrink-0" />}
      title="Konten"
      statusText={`${accounts.length} Konto${accounts.length !== 1 ? 'en' : ''} · Wähle welche ins Gesamtvermögen einfließen`}
    >
      <div className="flex flex-col gap-2">
        {accounts.map(a => (
          <AccountCard key={a.iban} account={a} onToggle={toggleIncluded} showToggle />
        ))}
      </div>
    </CollapsibleCard>
  )
}
