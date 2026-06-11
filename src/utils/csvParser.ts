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
  return new Date(str)
}

function parseGermanAmount(str: string): number {
  const cleaned = str.trim().replace(/"/g, '').replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

function cleanField(str: string): string {
  return str.trim().replace(/^"|"$/g, '')
}

// Commerzbank CSV format (semicolon separated, latin1 or utf-8)
export function parseCommerzbankCSV(text: string): Transaction[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Find header line (contains "Buchungstag" or "Wertstellung")
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

  const headers = lines[headerIndex].split(';').map(cleanField).map(h => h.toLowerCase())
  const dataLines = lines.slice(headerIndex + 1)

  const colDate = headers.findIndex(h => h.includes('buchungstag') || h.includes('wertstellung'))
  const colAmount = headers.findIndex(h => h.includes('betrag'))
  const colDescription = headers.findIndex(h => h.includes('buchungstext') || h.includes('verwendungszweck'))
  const colCounterparty = headers.findIndex(h => h.includes('auftraggeber') || h.includes('empfänger') || h.includes('beguenstigter'))
  const colIban = headers.findIndex(h => h.includes('iban') || h.includes('kontonummer'))

  const transactions: Transaction[] = []

  for (const line of dataLines) {
    if (!line || line.startsWith('"Kontonummer') || line.startsWith('Kontonummer')) continue

    const cols = line.split(';')
    if (cols.length < 3) continue

    const rawAmount = colAmount >= 0 ? cleanField(cols[colAmount] || '') : ''
    if (!rawAmount) continue

    const amount = parseGermanAmount(rawAmount)
    if (isNaN(amount)) continue

    const dateStr = colDate >= 0 ? cleanField(cols[colDate] || '') : ''
    const date = parseGermanDate(dateStr)
    if (isNaN(date.getTime())) continue

    const description = colDescription >= 0 ? cleanField(cols[colDescription] || '') : ''
    const counterparty = colCounterparty >= 0 ? cleanField(cols[colCounterparty] || '') : ''
    const iban = colIban >= 0 ? cleanField(cols[colIban] || '') : undefined

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
    })
  }

  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime())
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
