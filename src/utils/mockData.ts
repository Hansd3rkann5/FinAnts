import type { Transaction } from '@/types'
import { autoCategory } from './categorizer'
import { findMerchant } from './merchantLogos'
import { subDays, subMonths } from 'date-fns'

function tx(
  daysAgo: number,
  amount: number,
  counterparty: string,
  description: string,
): Transaction {
  const merchant = findMerchant(`${description} ${counterparty}`)
  return {
    id: `mock-${daysAgo}-${counterparty.slice(0, 6)}-${Math.random().toString(36).slice(2, 5)}`,
    date: subDays(new Date(), daysAgo),
    amount,
    type: amount >= 0 ? 'income' : 'expense',
    description,
    counterparty,
    categoryId: autoCategory(description, counterparty),
    merchantKey: merchant?.merchantKey,
    isRecurring: false,
  }
}

export const MOCK_TRANSACTIONS: Transaction[] = [
  // Income
  tx(0,  2450.00, 'Muster GmbH',       'Gehalt Juli 2025'),
  tx(30, 2450.00, 'Muster GmbH',       'Gehalt Juni 2025'),
  tx(60, 2450.00, 'Muster GmbH',       'Gehalt Mai 2025'),
  // Recurring bills
  tx(1,  -850.00, 'Immobilien Müller KG', 'Miete Juli 2025'),
  tx(31, -850.00, 'Immobilien Müller KG', 'Miete Juni 2025'),
  tx(61, -850.00, 'Immobilien Müller KG', 'Miete Mai 2025'),
  tx(2,  -14.99,  'Netflix',            'Netflix Abonnement'),
  tx(32, -14.99,  'Netflix',            'Netflix Abonnement'),
  tx(62, -14.99,  'Netflix',            'Netflix Abonnement'),
  tx(2,  -9.99,   'Spotify AB',         'Spotify Premium'),
  tx(32, -9.99,   'Spotify AB',         'Spotify Premium'),
  tx(62, -9.99,   'Spotify AB',         'Spotify Premium'),
  // Groceries
  tx(1,  -38.52, 'REWE Markt',          'REWE Einkauf'),
  tx(4,  -22.10, 'ALDI SUED',           'ALDI Einkauf'),
  tx(7,  -45.30, 'EDEKA Berger',        'EDEKA Wocheneinkauf'),
  tx(10, -18.80, 'LIDL',                'LIDL Einkauf'),
  tx(14, -31.40, 'REWE Markt',          'REWE Einkauf'),
  tx(18, -12.60, 'Penny GmbH',          'Penny Einkauf'),
  tx(21, -55.20, 'REWE Markt',          'REWE Großeinkauf'),
  tx(25, -28.90, 'Kaufland',            'Kaufland Einkauf'),
  // Dining
  tx(3,  -22.50, 'Lieferando.de',       'Bestellung #9281'),
  tx(8,  -8.90,  'McDonald\'s',         'McDonald\'s Bestellung'),
  tx(13, -34.00, 'Restaurant Oliva',    'Abendessen'),
  tx(20, -18.50, 'Starbucks',           'Starbucks Kaffee'),
  // Transport
  tx(5,  -9.00,  'DB Vertrieb GmbH',    'Bahnfahrt München-Frankfurt'),
  tx(15, -49.00, 'Deutschlandticket',   'Deutschlandticket Abo'),
  tx(22, -55.00, 'Aral Tankstelle',     'Tanken'),
  tx(45, -55.00, 'Aral Tankstelle',     'Tanken'),
  // Shopping
  tx(6,  -129.00, 'Zalando',            'Bestellung ZAL-12345'),
  tx(16, -39.90,  'Amazon',             'Amazon Bestellung'),
  tx(26, -249.00, 'MediaMarkt',         'Kopfhörer'),
  // Health
  tx(9,  -12.80, 'dm Drogerie',         'dm Einkauf'),
  tx(19, -28.50, 'Rossmann',            'Rossmann Einkauf'),
  tx(23, -35.00, 'Zahnarztpraxis König','Behandlung'),
  // Subscriptions
  tx(3,  -12.99, 'Disney Plus',         'Disney+ Abo'),
  tx(33, -12.99, 'Disney Plus',         'Disney+ Abo'),
  // Entertainment
  tx(11, -15.00, 'Eventim',             'Konzertticket'),
  tx(17, -12.00, 'Kino International',  'Filmabend'),
  // older months
  tx(subMonths(new Date(), 2).getDate() + 10,  -650.00, 'Lufthansa',    'Flug nach Lissabon'),
  tx(subMonths(new Date(), 2).getDate() + 12,  -280.00, 'Booking.com',  'Hotel Lissabon 3 Nächte'),
]

// Fix the subMonths usage - just use static values
MOCK_TRANSACTIONS.push(
  tx(72, -650.00, 'Lufthansa', 'Flug nach Lissabon'),
  tx(74, -280.00, 'Booking.com', 'Hotel Lissabon 3 Nächte'),
)
