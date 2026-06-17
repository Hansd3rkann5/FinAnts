#!/usr/bin/env node
// One-off local tool: run this AFTER wiping production D1 and reimporting
// transactions/bank_enriched.csv (the fresh import assigns every row a brand
// new id). Reads transactions/manual_overrides.json (written by
// scripts/capture-manual-overrides.mjs before the wipe), matches each
// captured override to its newly-imported row by amount + closest date, and
// writes the category_id / custom_icon straight back via SQL UPDATE — so the
// manual categorization/iconification work survives the wipe.
//
// Usage: node scripts/apply-manual-overrides.mjs

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OVERRIDES = 'transactions/manual_overrides.json'
const DATE_TOL_DAYS = 3
const TMP_SQL = 'transactions/.apply-overrides.sql'

function dayNum(dateStr) {
  return Math.floor(new Date(dateStr).getTime() / 86_400_000)
}
function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8'))
console.log(`${OVERRIDES}: ${overrides.length} captured overrides to reapply.`)

const sql = 'SELECT id, date, amount, counterparty FROM transactions;'
const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', 'finants-db', '--remote', '--json', '--command', sql], {
  cwd: 'worker', encoding: 'utf8', maxBuffer: 1024 * 1024 * 20,
})
const dbRows = JSON.parse(raw)[0].results
console.log(`D1 (post-reimport): ${dbRows.length} rows.`)

const byAmount = new Map()
dbRows.forEach((r, i) => {
  const k = Math.round(r.amount * 100)
  const arr = byAmount.get(k) ?? []
  arr.push(i)
  byAmount.set(k, arr)
})

const claimed = new Set()
const statements = []
const unmatched = []

for (const o of overrides) {
  const cents = Math.round(o.amount * 100)
  const candidates = (byAmount.get(cents) ?? []).filter(i => !claimed.has(i))
  let best = -1, bestDiff = Infinity
  for (const i of candidates) {
    const diff = Math.abs(dayNum(o.date) - dayNum(dbRows[i].date))
    if (diff <= DATE_TOL_DAYS && diff < bestDiff) { best = i; bestDiff = diff }
  }
  if (best === -1) { unmatched.push(o); continue }
  claimed.add(best)
  const newId = dbRows[best].id
  const sets = []
  if (o.categoryId) sets.push(`category_id = ${sqlString(o.categoryId)}`)
  if (o.customIcon) sets.push(`custom_icon = ${sqlString(o.customIcon)}`)
  if (sets.length) {
    statements.push(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ${sqlString(newId)};`)
  }
}

if (!statements.length) {
  console.log('Nothing to apply (no matches).')
} else {
  writeFileSync(TMP_SQL, statements.join('\n') + '\n', 'utf8')
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'finants-db', '--remote', '--file', `../${TMP_SQL}`], {
    cwd: 'worker', stdio: 'inherit',
  })
  unlinkSync(TMP_SQL)
  console.log(`Applied ${statements.length} overrides.`)
}

if (unmatched.length) {
  console.log(`\n${unmatched.length} captured overrides found NO matching row after reimport:`)
  for (const o of unmatched) {
    console.log(`  ${o.date}  ${o.amount.toFixed(2).padStart(8)}  ${o.counterparty}  category=${o.categoryId ?? '-'} icon=${o.customIcon ? 'yes' : '-'}`)
  }
}
