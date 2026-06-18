#!/usr/bin/env node
// One-off local tool: matches the PayPal-counterparty rows in the bank CSV
// against the consolidated transactions/paypal.csv (produced by
// extract-paypal.mjs) by amount + date proximity, and writes two files:
//
//   transactions/bank_enriched.csv — the COMPLETE bank CSV, line for line,
//     with matched rows' Sender/Empfänger replaced by the real PayPal
//     counterparty (Gegenpartei) and Verwendungszweck replaced by
//     "Buchungstext + Notiz". Rows whose amount has no exact paypal.csv match
//     (e.g. Bandcamp's USD-priced purchases, which never line up cent-for-cent
//     after conversion) but whose own Buchungstext already names the merchant
//     fall back to that merchant's most common purpose text instead — see
//     extractMerchantName(). Every other row (non-PayPal, truly unmatched,
//     pending) passes through unchanged. This is a straight replacement for
//     the original bank CSV — importing it imports each transaction exactly
//     once (no separate "enriched subset" file that would duplicate rows on
//     import). parseCommerzbankCSV reads customLabel from Verwendungszweck
//     and counterparty from Sender/Empfänger, so this is enough to enrich both.
//   transactions/paypal_unmatched.csv — paypal.csv rows that found no
//     corresponding row in the bank CSV (kept in the original paypal.csv
//     shape, for manual review — these are not imported anywhere).
//   transactions/bank_paypal_unmatched.csv — the bank CSV's PayPal rows that
//     found no paypal.csv match (kept in the original bank CSV shape, for
//     manual review — already included unchanged in bank_enriched.csv too).
//
// Usage: node scripts/merge-paypal.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const BANK_CSV = 'transactions/DE25700400450230082000_EUR_13-06-2026_0746.csv'
const PAYPAL_CSV = 'transactions/paypal.csv'
const OUT_ENRICHED = 'transactions/bank_enriched.csv'
const OUT_UNMATCHED = 'transactions/paypal_unmatched.csv'
const OUT_BANK_UNMATCHED = 'transactions/bank_paypal_unmatched.csv'

const DATE_TOL_DAYS = 6 // PayPal Lastschrift settles a few days after the PayPal-side date

function cleanField(s) {
  return s.trim().replace(/^"|"$/g, '')
}

function parseGermanAmount(str) {
  const cleaned = str.trim().replace(/"/g, '').replace(/−/g, '-').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? NaN : n
}

function parseGermanDate(str) {
  const [d, m, y] = str.trim().split('.')
  return new Date(Number(y), Number(m) - 1, Number(d))
}

function dayNum(d) {
  return Math.floor(d.getTime() / 86_400_000)
}

function csvField(s) {
  const v = String(s ?? '')
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// Fallback for PayPal Lastschrift rows whose amount doesn't exactly match any
// paypal.csv entry (e.g. Bandcamp's "pay what you want" pricing produces
// USD->EUR conversions that never line up cent-for-cent with the PayPal-side
// ledger; LogPay batches several small toll/parking charges into one
// Lastschrift) but whose own Buchungstext already names the real merchant,
// e.g. ".../PP.1165.PP/. Bandcamp Ventures LLC, Ihr Einkauf bei ..." or the
// shorter ".../. LogPay Financial Services GmbH, Ihr Einkauf bei ..." form
// (no "PP.<n>.PP" segment).
function extractMerchantName(buchungstext) {
  const t = buchungstext.replace(/[\r\n]/g, '').replace(/\s{2,}/g, ' ')
  const m = t.match(/\d{6,}\/(?:PP\.\d+\.PP\/)?\.\s*([^,]+?)\s*,\s*Ihr Einkauf bei/i)
  return m?.[1]?.trim()
}

// Strip ALL whitespace (not just collapse it) — RTF/CSV line-wrapping
// sometimes injects a stray space mid-word ("Readly A B" vs "Readly AB",
// "Takeaway .com" vs "Takeaway.com"), so whitespace can't be trusted as a
// real word boundary when comparing names from different sources.
function normName(s) {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

// PayPal BNPL products: the Gegenpartei IS the merchant here (PayPal is
// fronting/financing the purchase), and the Buchungstext is just "Zahlung" /
// "Rückzahlung" — too generic to be useful as the displayed label.
const GENERIC_PRODUCT_NAMES = new Set(['paypalratenzahlung', 'bezahlungnach30tagen'])

function mode(values) {
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best, bestCount = 0
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c }
  return best
}

// ─── Parse bank CSV ──────────────────────────────────────────────────────

const bankText = readFileSync(BANK_CSV, 'utf8')
const bankLines = bankText.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)
const bankHeaderLine = bankLines[0].replace(/^﻿/, '')
const bankHeaders = bankHeaderLine.split(';').map(h => cleanField(h).toLowerCase())
const bankDataLines = bankLines.slice(1)

const col = {
  buchungstag: bankHeaders.findIndex(h => h.includes('buchungstag')),
  wertstellung: bankHeaders.findIndex(h => h.includes('wertstellung')),
  umsatzart: bankHeaders.findIndex(h => h.includes('umsatzart')),
  buchungstext: bankHeaders.findIndex(h => h.includes('buchungstext')),
  betrag: bankHeaders.findIndex(h => h === 'betrag' || h.includes('betrag')),
  waehrung: bankHeaders.findIndex(h => h.includes('währung') || h.includes('waehrung')),
  iban: bankHeaders.findIndex(h => h.includes('iban kontoinhaber')),
  kategorie: bankHeaders.findIndex(h => h.includes('kategorie')),
  sender: bankHeaders.findIndex(h => h === 'sender'),
  empfaenger: bankHeaders.findIndex(h => h === 'empfänger'),
  verwendungszweck: bankHeaders.findIndex(h => h.includes('verwendungszweck')),
}

// Every PayPal-counterparty candidate row, tagged with its index into
// bankDataLines so the enriched result can be spliced back into the full
// line list in its original position.
const bankRows = []
bankDataLines.forEach((line, lineIndex) => {
  if (line.startsWith('"Kontonummer') || line.startsWith('Kontonummer')) return
  const cols = line.split(';')
  if (cols.length < 3) return
  const rawAmount = cleanField(cols[col.betrag] ?? '')
  if (!rawAmount) return
  const amount = parseGermanAmount(rawAmount)
  if (isNaN(amount)) return
  const buchungstag = cleanField(cols[col.buchungstag] ?? '')
  if (!buchungstag) return // pending row — no stable date to match on, passes through unchanged
  const sender = cleanField(cols[col.sender] ?? '')
  const empfaenger = cleanField(cols[col.empfaenger] ?? '')
  const isPaypal = /paypal/i.test(sender) || /paypal/i.test(empfaenger)
  if (!isPaypal) return
  const buchungstext = cleanField(cols[col.buchungstext] ?? '')
  bankRows.push({
    lineIndex, cols, amount,
    date: parseGermanDate(buchungstag),
    senderIsPaypal: /paypal/i.test(sender),
    // "PAYPAL INSTANT TRANSFER" payouts flip sign vs the PayPal-side ledger
    // (negative leaving PayPal balance, positive arriving in the bank) — flag
    // them so matching only looks at sign-flipped candidates, never same-sign
    // ones (which would be unrelated person-to-person PayPal-internal entries
    // that happen to share the same amount).
    isInstantTransfer: /instant transfer/i.test(buchungstext),
  })
})

console.log(`Bank CSV: ${bankDataLines.length} total rows, ${bankRows.length} PayPal-counterparty candidates.`)

// ─── Parse paypal.csv ────────────────────────────────────────────────────

const ppText = readFileSync(PAYPAL_CSV, 'utf8')
const ppLines = ppText.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)
const ppRows = []
for (const line of ppLines.slice(1)) {
  // Respect quoted fields (Notiz/Buchungstext can contain ';').
  const fields = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ';') { fields.push(cur); cur = '' }
      else cur += c
    }
  }
  fields.push(cur)
  const [datum, betrag, gegenpartei, buchungstext, notiz, transaktionsId, logoUrl] = fields
  const amount = parseGermanAmount(betrag)
  if (isNaN(amount)) continue
  ppRows.push({ date: parseGermanDate(datum), amount, gegenpartei, buchungstext, notiz, transaktionsId, logoUrl, raw: line })
}

console.log(`paypal.csv: ${ppRows.length} rows loaded.`)

// ─── Match bank rows ↔ paypal.csv rows (amount + closest date within tolerance) ──

const byAmount = new Map()
ppRows.forEach((r, i) => {
  const k = Math.round(r.amount * 100)
  const arr = byAmount.get(k) ?? []
  arr.push(i)
  byAmount.set(k, arr)
})

// Name-based fallback index: every paypal.csv row, grouped by normalized
// Gegenpartei, regardless of whether it gets claimed by an exact amount
// match elsewhere. Used only when amount+date matching fails outright.
const byMerchantName = new Map()
ppRows.forEach((r, i) => {
  const k = normName(r.gegenpartei)
  const arr = byMerchantName.get(k) ?? []
  arr.push(i)
  byMerchantName.set(k, arr)
})

const claimed = new Set()
const enrichedByLineIndex = new Map()
const unmatchedBankLines = []
let unmatchedBankCount = 0
let nameFallbackCount = 0

for (const b of bankRows) {
  const cents = Math.round(b.amount * 100)
  const lookupCents = b.isInstantTransfer ? -cents : cents
  const candidates = (byAmount.get(lookupCents) ?? []).filter(i => !claimed.has(i))
  let best = -1, bestDiff = Infinity
  for (const i of candidates) {
    const diff = Math.abs(dayNum(b.date) - dayNum(ppRows[i].date))
    if (diff <= DATE_TOL_DAYS && diff < bestDiff) { best = i; bestDiff = diff }
  }
  if (best === -1) {
    // No exact amount+date match — fall back to extracting the merchant
    // name straight out of this row's own Buchungstext, then borrowing the
    // typical purpose text (mode of Buchungstext/Notiz) from that merchant's
    // other paypal.csv entries, if any exist under that name.
    const buchungstext = cleanField(b.cols[col.buchungstext] ?? '')
    const merchantName = extractMerchantName(buchungstext)
    const sameNameIdx = merchantName ? (byMerchantName.get(normName(merchantName)) ?? []) : []
    if (sameNameIdx.length === 0) {
      unmatchedBankCount++
      unmatchedBankLines.push(b.cols.join(';'))
      continue
    }
    const samples = sameNameIdx.map(i => ppRows[i])
    const gegenpartei = mode(samples.map(r => r.gegenpartei))
    const verwendungszweck = [mode(samples.map(r => r.buchungstext)), mode(samples.map(r => r.notiz).filter(Boolean))]
      .filter(Boolean).join(' · ')
    const newCols = [...b.cols]
    if (b.senderIsPaypal) {
      newCols[col.sender] = csvField(gegenpartei)
      newCols[col.empfaenger] = ''
    } else {
      newCols[col.sender] = ''
      newCols[col.empfaenger] = csvField(gegenpartei)
    }
    newCols[col.verwendungszweck] = csvField(verwendungszweck)
    enrichedByLineIndex.set(b.lineIndex, newCols.join(';'))
    nameFallbackCount++
    continue
  }
  claimed.add(best)
  const pp = ppRows[best]
  const newCols = [...b.cols]
  // PayPal's own BNPL products show up as the Gegenpartei itself ("PayPal
  // Ratenzahlung", "Bezahlung nach 30 Tagen") with a near-content-free
  // Buchungstext ("Zahlung"/"Rückzahlung") — the product name IS the useful
  // label here, so use it instead of the generic boilerplate text.
  const verwendungszweck = GENERIC_PRODUCT_NAMES.has(normName(pp.gegenpartei))
    ? pp.gegenpartei
    : [pp.buchungstext, pp.notiz].filter(Boolean).join(' · ')
  if (b.senderIsPaypal) {
    newCols[col.sender] = csvField(pp.gegenpartei)
    newCols[col.empfaenger] = ''
  } else {
    newCols[col.sender] = ''
    newCols[col.empfaenger] = csvField(pp.gegenpartei)
  }
  newCols[col.verwendungszweck] = csvField(verwendungszweck)
  enrichedByLineIndex.set(b.lineIndex, newCols.join(';'))
}

const unmatchedPpRows = ppRows.filter((_, i) => !claimed.has(i))

const outLines = bankDataLines.map((line, i) => enrichedByLineIndex.get(i) ?? line)
writeFileSync(OUT_ENRICHED, [bankHeaderLine, ...outLines].join('\n') + '\n', 'utf8')
writeFileSync(OUT_UNMATCHED, [ppLines[0], ...unmatchedPpRows.map(r => r.raw)].join('\n') + '\n', 'utf8')
writeFileSync(OUT_BANK_UNMATCHED, [bankHeaderLine, ...unmatchedBankLines].join('\n') + '\n', 'utf8')

console.log(`Wrote ${outLines.length} rows (${enrichedByLineIndex.size} enriched in place, of which ${nameFallbackCount} via merchant-name fallback) -> ${OUT_ENRICHED}`)
console.log(`Bank-side PayPal rows with no paypal.csv match at all: ${unmatchedBankCount} -> ${OUT_BANK_UNMATCHED} (left untouched in ${OUT_ENRICHED} too, original PayPal boilerplate)`)
console.log(`paypal.csv rows with no bank-side match: ${unmatchedPpRows.length} -> ${OUT_UNMATCHED}`)
