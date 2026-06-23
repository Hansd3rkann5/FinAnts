import type { Transaction } from '@/types'

export const TRADE_REPUBLIC_IBAN = 'DE62100123454047536911'

// `pytr export_transactions` writes account_transactions.csv with semicolon-
// separated columns: Date;Type;Value;Note;ISIN;Shares;Fees;Taxes;ISIN2;Shares2
// `Type` is auto-translated to the system locale (English or German seen in
// practice) — map both so the parser doesn't silently misfile everything as
// "Sonstiges" on a differently-configured machine.
const TYPE_CATEGORY: Record<string, string> = {
  buy: 'savings', kauf: 'savings',
  sell: 'savings', verkauf: 'savings',
  deposit: 'transfer', einlage: 'transfer',
  removal: 'transfer', entnahme: 'transfer',
  dividend: 'income', dividende: 'income',
  interest: 'income', zinsen: 'income',
  'interest charge': 'fees', zinsbelastung: 'fees',
  fees: 'fees', gebühren: 'fees', gebuehren: 'fees',
  'fees refund': 'income', gebührenerstattung: 'income', gebuehrenerstattung: 'income',
  taxes: 'fees', steuern: 'fees',
  'tax refund': 'income', steuerrückerstattung: 'income', steuerrueckerstattung: 'income',
  'transfer (inbound)': 'transfer', 'umbuchung (eingang)': 'transfer',
  'transfer (outbound)': 'transfer', 'umbuchung (ausgang)': 'transfer',
  spinoff: 'other', split: 'other', swap: 'other',
}

function categoryForType(type: string): string {
  return TYPE_CATEGORY[type.trim().toLowerCase()] ?? 'other'
}

function cleanField(s: string): string {
  return s.trim().replace(/^"(.*)"$/, '$1')
}

export function parseTradeRepublicCSV(text: string, accountIban: string): Transaction[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => cleanField(h).toLowerCase())
  const colDate   = headers.indexOf('date')
  const colType   = headers.indexOf('type')
  const colValue  = headers.indexOf('value')
  const colNote   = headers.indexOf('note')
  const colIsin   = headers.indexOf('isin')
  const colShares = headers.indexOf('shares')

  if (colDate < 0 || colType < 0 || colValue < 0) {
    throw new Error('Unbekanntes Trade-Republic-CSV-Format. Bitte mit "pytr export_transactions" exportieren.')
  }

  const transactions: Transaction[] = []

  for (const line of lines.slice(1)) {
    const cols = line.split(sep)

    const rawValue = cleanField(cols[colValue] ?? '')
    if (!rawValue) continue
    const amount = parseFloat(rawValue)
    if (isNaN(amount)) continue

    const date = new Date(cleanField(cols[colDate] ?? ''))
    if (isNaN(date.getTime())) continue

    const type = cleanField(cols[colType] ?? '')
    const note = cleanField(cols[colNote] ?? '')
    const isin = colIsin >= 0 ? cleanField(cols[colIsin] ?? '') : ''
    const shares = colShares >= 0 ? cleanField(cols[colShares] ?? '') : ''

    const categoryId = categoryForType(type)
    const reference = [isin && `ISIN: ${isin}`, shares && `Stück: ${shares}`].filter(Boolean).join(' · ') || undefined

    transactions.push({
      id: `${date.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      amount,
      type: categoryId === 'transfer' ? 'transfer' : amount >= 0 ? 'income' : 'expense',
      description: type,
      counterparty: note || type,
      categoryId,
      reference,
      accountIban,
    })
  }

  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime())
}
