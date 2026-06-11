import { autoCategory } from './categorizer'
import { findMerchant } from './merchantLogos'
import type { Transaction } from '@/types'

function parseGermanDate(str: string): Date {
  const cleaned = str.trim().replace(/"/g, '')
  const parts = cleaned.split('.')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return new Date(Number(year), Number(month) - 1, Number(day))
  }
  // ISO date fallback (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return new Date(cleaned)
  return new Date(NaN)
}


function parseGermanAmount(str: string): number {
  const cleaned = str.trim().replace(/"/g, '').replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

function cleanField(str: string): string {
  return str.trim().replace(/^"|"$/g, '')
}

// Commerzbank CSV format — supports both semicolon-separated and tab-separated exports
export function parseCommerzbankCSV(text: string): Transaction[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Find header line
  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('buchungstag') || lines[i].toLowerCase().includes('wertstellung')) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) {
    throw new Error('Kein gültiges Commerzbank-CSV-Format erkannt. Bitte exportiere die Datei aus dem Commerzbank OnlineBanking.')
  }

  // Auto-detect separator: tab or semicolon
  const headerLine = lines[headerIndex]
  const sep = headerLine.includes('\t') ? '\t' : ';'

  const headers = headerLine.split(sep).map(cleanField).map(h => h.toLowerCase())
  const dataLines = lines.slice(headerIndex + 1)

  const colBuchungstag = headers.findIndex(h => h.includes('buchungstag'))
  const colWertstellung = headers.findIndex(h => h.includes('wertstellung'))
  const colAmount      = headers.findIndex(h => h === 'betrag' || h.includes('betrag'))
  const colDescription = headers.findIndex(h => h.includes('buchungstext'))
  const colReference   = headers.findIndex(h => h.includes('verwendungszweck'))
  const colSender      = headers.findIndex(h => h === 'sender' || h.includes('auftraggeber'))
  const colRecipient   = headers.findIndex(h => h === 'empfänger' || h.includes('beguenstigter') || h.includes('begünstigter'))
  const colIban        = headers.findIndex(h => h.includes('iban kontoinhaber') || (h.includes('iban') && !h.includes('empfänger') && !h.includes('sender')))

  const transactions: Transaction[] = []

  for (const line of dataLines) {
    if (!line || line.startsWith('"Kontonummer') || line.startsWith('Kontonummer')) continue

    const cols = line.split(sep)
    if (cols.length < 3) continue

    const rawAmount = colAmount >= 0 ? cleanField(cols[colAmount] ?? '') : ''
    if (!rawAmount) continue

    const amount = parseGermanAmount(rawAmount)
    if (isNaN(amount)) continue

    // Description fields (needed for date fallback too)
    const buchungstext     = colDescription >= 0 ? cleanField(cols[colDescription] ?? '') : ''
    const verwendungszweck = colReference   >= 0 ? cleanField(cols[colReference]   ?? '') : ''
    const description = [buchungstext, verwendungszweck].filter(Boolean).join(' · ')

    const buchungstag  = colBuchungstag  >= 0 ? cleanField(cols[colBuchungstag]  ?? '') : ''
    const wertstellung = colWertstellung >= 0 ? cleanField(cols[colWertstellung] ?? '') : ''

    // Empty Buchungstag = pending (authorized but not yet booked)
    const isPending = !buchungstag

    let date = parseGermanDate(buchungstag)
    if (isNaN(date.getTime())) date = parseGermanDate(wertstellung)
    if (isNaN(date.getTime())) {
      // Extract authorization date from description text for display
      const m = (buchungstext + ' ' + verwendungszweck).match(/(\d{2})\.(\d{2})\.(\d{4})/)
      date = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date()
    }

    // Use Sender for incoming, Empfänger for outgoing (whichever is filled)
    const sender    = colSender >= 0    ? cleanField(cols[colSender] ?? '')    : ''
    const recipient = colRecipient >= 0 ? cleanField(cols[colRecipient] ?? '') : ''
    const counterparty = sender || recipient

    const iban = colIban >= 0 ? cleanField(cols[colIban] ?? '') || undefined : undefined

    const type = amount >= 0 ? 'income' : 'expense'
    const merchant = findMerchant(`${description} ${counterparty}`)
    const categoryId = autoCategory(description, counterparty)

    transactions.push({
      id: `${date.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      amount,
      type,
      description,
      counterparty,
      iban,
      categoryId,
      merchantKey: merchant?.merchantKey,
      isPending: isPending || undefined,
    })
  }

  // Pending first, then descending by date
  return transactions.sort((a, b) => {
    if (a.isPending && !b.isPending) return -1
    if (!a.isPending && b.isPending) return 1
    return b.date.getTime() - a.date.getTime()
  })
}

// Alternative: MT940 format (SWIFT standard used by many German banks)
export function parseMT940(text: string): Transaction[] {
  const transactions: Transaction[] = []
  const lines = text.split('\n')
  let currentDate: Date | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith(':60F:') || line.startsWith(':60M:')) {
      const match = line.match(/:60[FM]:([CD])(\d{6})/)
      if (match) {
        const [, , dateStr] = match
        currentDate = new Date(
          2000 + parseInt(dateStr.slice(0, 2)),
          parseInt(dateStr.slice(2, 4)) - 1,
          parseInt(dateStr.slice(4, 6))
        )
      }
    }

    if (line.startsWith(':61:')) {
      const match = line.match(/:61:(\d{6})(\d{4})?([CD])(\d+),(\d*)/)
      if (match && currentDate) {
        const [, dateStr, , cd, wholePart, decPart] = match
        const d = parseInt(dateStr.slice(0, 2))
        const m = parseInt(dateStr.slice(2, 4)) - 1
        const txDate = new Date(currentDate.getFullYear(), m, d)

        const amount = parseFloat(`${wholePart}.${decPart || '00'}`) * (cd === 'D' ? -1 : 1)

        let description = ''
        let j = i + 1
        while (j < lines.length && !lines[j].startsWith(':')) {
          description += ' ' + lines[j].trim()
          j++
        }
        description = description.trim()

        const merchant = findMerchant(description)
        const categoryId = autoCategory(description, '')

        transactions.push({
          id: `${txDate.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
          date: txDate,
          amount,
          type: amount >= 0 ? 'income' : 'expense',
          description,
          counterparty: '',
          categoryId,
          merchantKey: merchant?.merchantKey,
        })
      }
    }
  }

  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export function detectAndParse(text: string): Transaction[] {
  if (text.includes(':20:') || text.includes(':61:')) {
    return parseMT940(text)
  }
  return parseCommerzbankCSV(text)
}
