import type { CategoryId } from '@/types'
import { findMerchant, fold } from './merchantLogos'

interface Rule {
  keywords: string[]
  category: CategoryId
}

const RULES: Rule[] = [
  { keywords: ['gehalt', 'lohn', 'salary', 'gutschrift arbeitgeber', 'entgelt'], category: 'income' },
  { keywords: ['miete', 'kaltmiete', 'warmmiete', 'mietkosten', 'nebenkosten', 'hausverwaltung', 'wohnungsgeld'], category: 'housing' },
  { keywords: ['strom', 'gas', 'stadtwerke', 'eon', 'e.on', 'vattenfall', 'innogy', 'yello', 'enbw', 'naturstrom', 'lichtblick', 'entega'], category: 'housing' },
  { keywords: ['internet', 'breitband', 'dsl', 'kabel deutschland', 'unitymedia'], category: 'housing' },
  { keywords: ['bahn', 'mvv', 'hvv', 'vbb', 'bvg', 'nahverkehr', 'öpnv', 'bus ticket', 'deutschlandticket'], category: 'transport' },
  { keywords: ['tankstelle', 'tanken', 'fuel', 'kraftstoff', 'parkhaus', 'parkticket'], category: 'transport' },
  { keywords: ['apotheke', 'arzt', 'praxis', 'krankenhaus', 'klinik', 'zahnarzt', 'physiotherap', 'optiker'], category: 'health' },
  { keywords: ['versicherung', 'assekuranz', 'beitrag kv', 'beitrag rv', 'pflegeversicherung', 'unfallversicherung'], category: 'insurance' },
  { keywords: ['kino', 'theater', 'konzert', 'museum', 'eventim', 'ticketmaster', 'reservix', 'billet'], category: 'entertainment' },
  { keywords: ['fitness', 'gym', 'mcfit', 'clever fit', 'sportstudio', 'sport scheck', 'intersport'], category: 'entertainment' },
  { keywords: ['bücher', 'buch', 'thalia', 'hugendubel', 'weltbild', 'readly', 'kindle'], category: 'education' },
  { keywords: ['schule', 'universität', 'volkshochschule', 'kurs', 'studiengebühr', 'nachhilfe', 'duolingo'], category: 'education' },
  { keywords: ['spar', 'sparkasse einlage', 'tagesgeld', 'festgeld', 'etf', 'depot'], category: 'savings' },
  { keywords: ['überweisung eigene', 'eigenkonto', 'eigene konten', 'umbuchung'], category: 'transfer' },
  { keywords: ['kontoführung', 'benachrichtigungsentgelt', 'depotentgelt'], category: 'fees' },
  // Generic German business-type words rather than individual brand names —
  // catches any bakery/transit operator regardless of which one it is.
  { keywords: ['bäckerei'], category: 'dining' },
  { keywords: ['verkehrs'], category: 'transport' },
]

export function autoCategory(description: string, counterparty: string): CategoryId {
  const combined = fold(`${description} ${counterparty}`.toLowerCase())

  const merchant = findMerchant(combined)
  if (merchant?.categoryOverride) {
    return merchant.categoryOverride as CategoryId
  }

  for (const rule of RULES) {
    if (rule.keywords.some(k => combined.includes(fold(k)))) {
      return rule.category
    }
  }

  return 'other'
}
