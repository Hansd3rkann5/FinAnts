#!/usr/bin/env node
// One-off local tool: before wiping the production D1 table and reimporting
// transactions/bank_enriched.csv, this captures every transaction you've
// manually categorized or iconified (category_id / custom_icon — the CSV
// importer never sets either of those itself, see src/utils/transactionsApi.ts
// MergeRow comment, so any non-null value in D1 today is a real manual edit),
// matches each one to its row in bank_enriched.csv by amount + closest date,
// and writes the result to transactions/manual_overrides.json.
//
// After you wipe + reimport, run scripts/apply-manual-overrides.mjs to look
// up each transaction's new id (assigned fresh on import) and PATCH the
// category/icon back onto it — so none of your manual work is lost.
//
// Usage: node scripts/capture-manual-overrides.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const BANK_ENRICHED = 'transactions/bank_enriched.csv'
const OUT = 'transactions/manual_overrides.json'
const DATE_TOL_DAYS = 3

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

// ─── Pull every manually-edited row straight from production D1 ────────────

const sql = "SELECT id, date, amount, counterparty, category_id, custom_icon, source FROM transactions WHERE category_id IS NOT NULL OR custom_icon IS NOT NULL ORDER BY date;"
const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', 'finants-db', '--remote', '--json', '--command', sql], {
  cwd: 'worker', encoding: 'utf8', maxBuffer: 1024 * 1024 * 20,
})
const d1Rows = JSON.parse(raw)[0].results
console.log(`D1: ${d1Rows.length} rows with a manual category and/or icon.`)

// ─── Parse bank_enriched.csv ─────────────────────────────────────────────

const bankText = readFileSync(BANK_ENRICHED, 'utf8')
const bankLines = bankText.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)
const bankHeaders = bankLines[0].replace(/^﻿/, '').split(';').map(h => cleanField(h).toLowerCase())
const col = {
  buchungstag: bankHeaders.findIndex(h => h.includes('buchungstag')),
  betrag: bankHeaders.findIndex(h => h === 'betrag' || h.includes('betrag')),
  sender: bankHeaders.findIndex(h => h === 'sender'),
  empfaenger: bankHeaders.findIndex(h => h === 'empfänger'),
}

const csvRows = []
bankLines.slice(1).forEach((line, lineIndex) => {
  if (line.startsWith('"Kontonummer') || line.startsWith('Kontonummer')) return
  const cols = line.split(';')
  if (cols.length < 3) return
  const rawAmount = cleanField(cols[col.betrag] ?? '')
  if (!rawAmount) return
  const amount = parseGermanAmount(rawAmount)
  if (isNaN(amount)) return
  const buchungstag = cleanField(cols[col.buchungstag] ?? '')
  if (!buchungstag) return
  const counterparty = cleanField(cols[col.sender] ?? '') || cleanField(cols[col.empfaenger] ?? '')
  csvRows.push({ lineIndex, amount, date: parseGermanDate(buchungstag), counterparty })
})

console.log(`${BANK_ENRICHED}: ${csvRows.length} importable rows.`)

// ─── Match D1 rows -> CSV rows by amount + closest date ────────────────────

const byAmount = new Map()
csvRows.forEach((r, i) => {
  const k = Math.round(r.amount * 100)
  const arr = byAmount.get(k) ?? []
  arr.push(i)
  byAmount.set(k, arr)
})

const claimed = new Set()
const matched = []
const unmatched = []

for (const d of d1Rows) {
  const cents = Math.round(d.amount * 100)
  const d1Date = new Date(d.date)
  const candidates = (byAmount.get(cents) ?? []).filter(i => !claimed.has(i))
  let best = -1, bestDiff = Infinity
  for (const i of candidates) {
    const diff = Math.abs(dayNum(d1Date) - dayNum(csvRows[i].date))
    if (diff <= DATE_TOL_DAYS && diff < bestDiff) { best = i; bestDiff = diff }
  }
  if (best === -1) { unmatched.push(d); continue }
  claimed.add(best)
  const csvRow = csvRows[best]
  matched.push({
    date: csvRow.date.toISOString().slice(0, 10),
    amount: csvRow.amount,
    counterparty: csvRow.counterparty,
    categoryId: d.category_id ?? undefined,
    customIcon: d.custom_icon ?? undefined,
    oldId: d.id,
    oldCounterparty: d.counterparty,
  })
}

writeFileSync(OUT, JSON.stringify(matched, null, 2) + '\n', 'utf8')

console.log(`Matched ${matched.length}/${d1Rows.length} manually-edited rows to ${BANK_ENRICHED} -> ${OUT}`)
if (unmatched.length) {
  console.log(`\n${unmatched.length} manually-edited rows had NO match in ${BANK_ENRICHED} (won't survive a wipe+reimport unless handled separately):`)
  for (const d of unmatched) {
    console.log(`  ${d.date}  ${d.amount.toFixed(2).padStart(8)}  ${d.counterparty}  category=${d.category_id ?? '-'} icon=${d.custom_icon ? 'yes' : '-'}  source=${d.source}`)
  }
}
