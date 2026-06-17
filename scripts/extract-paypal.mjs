#!/usr/bin/env node
// One-off local tool: extracts PayPal activity from the saved RTF-wrapped
// "Activity" page exports (transactions/PayPal_*.html — actually RTF content
// despite the extension, produced by macOS "Save As Rich Text" from the
// PayPal website) into one consolidated, semicolon-separated CSV covering
// the whole period, formatted in the same style (German date/decimal,
// semicolon-separated) as the Commerzbank export.
//
// Usage: node scripts/extract-paypal.mjs
// Reads transactions/PayPal_*.html, writes transactions/paypal.csv

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILES = [
  { path: 'transactions/PayPal_13062025-31072025.html', defaultYear: 2025 },
  { path: 'transactions/PayPal_01082025-31122025.html', defaultYear: 2025 },
  { path: 'transactions/PayPal_2026.html',               defaultYear: 2026 },
]
const OUT_PATH = 'transactions/paypal.csv'

const MONTHS = { jan: 1, feb: 2, mär: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 }

function decodeEntities(s) {
  // RTF line-wrapping can inject whitespace/newlines in the middle of a
  // word (e.g. "LogPay Financial Services    GmbH") — collapse all runs.
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function rtfHtmlToText(path) {
  // The exported files are RTF content saved with an .html extension.
  // textutil only decodes the RTF escapes reliably when the input has a
  // .rtf extension, so copy it first rather than converting in place.
  const dir = mkdtempSync(join(tmpdir(), 'pp-'))
  const rtfCopy = join(dir, 'in.rtf')
  const out = join(dir, 'out.txt')
  copyFileSync(path, rtfCopy)
  execSync(`textutil -convert txt -output ${JSON.stringify(out)} ${JSON.stringify(rtfCopy)}`)
  return readFileSync(out, 'utf8')
}

function parseAmount(raw) {
  // Some rows render the sign in a separate span from the digits, with
  // whitespace/newlines from RTF line-wrapping in between — strip all
  // whitespace, not just the ends.
  const cleaned = decodeEntities(raw).replace(/\s+/g, '').replace(/−/g, '-').replace(/€/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// "8. Juni . Zahlung" / "13. Aug. . Bezahlung nach 30 Tagen . Zurückgezahlt"
function parseDateLabel(text, year) {
  const m = decodeEntities(text).match(/^(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\.?\s*\.\s*(.+)$/)
  if (!m) return null
  const day = Number(m[1])
  const monthKey = m[2].toLowerCase().slice(0, 3)
  const month = MONTHS[monthKey]
  if (!month) return null
  return { date: new Date(year, month - 1, day), label: m[3].trim() }
}

function extractFile({ path, defaultYear }) {
  const text = rtfHtmlToText(path)

  // Collect (offset, year) for every "Month YYYY" bucket header in document order.
  const headerRe = /listBucketSubHeader[^"]*"[^>]*>([^<]*)</g
  const headers = []
  let hm
  while ((hm = headerRe.exec(text))) {
    const t = decodeEntities(hm[1])
    const ym = t.match(/^([A-Za-zÄÖÜäöüß]+)\.?\s+(\d{4})$/)
    if (ym) headers.push({ offset: hm.index, year: Number(ym[2]) })
  }
  function yearAt(offset) {
    let year = defaultYear
    for (const h of headers) { if (h.offset <= offset) year = h.year; else break }
    return year
  }

  // Split into one chunk per transaction item.
  const itemRe = /class="list_item js_transactionItem-([^"]+)"/g
  const starts = []
  let im
  while ((im = itemRe.exec(text))) starts.push({ id: im[1], offset: im.index })

  const rows = []
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].offset
    const end = i + 1 < starts.length ? starts[i + 1].offset : text.length
    const chunk = text.slice(start, end)

    const counterpartyM = chunk.match(/class="counterparty_name css-1htline[^"]*"[^>]*>([^<]*)</)
    const amountM = chunk.match(/class="((?:isCredit|isNeutral)?)\s*txn_amt_font[^"]*"[^>]*>([^<]*)</)
    const typeM = chunk.match(/class="transaction_type_text[^"]*"[^>]*>([^<]*)</)
    const notesM = chunk.match(/class="transaction_notes[^"]*"[^>]*>([^<]*)</)
    const logoM = chunk.match(/<img src="([^"]*)"/)

    if (!counterpartyM || !amountM || !typeM) continue

    const dl = parseDateLabel(typeM[1], yearAt(start))
    if (!dl) continue

    const amount = parseAmount(amountM[2])
    if (amount === null) continue
    const isNeutral = amountM[1] === 'isNeutral'

    rows.push({
      id: starts[i].id,
      date: dl.date,
      amount: isNeutral ? amount : amount, // sign already present in the printed text for credit/debit
      counterparty: decodeEntities(counterpartyM[1]),
      label: dl.label + (isNeutral ? ' (Ratenzahlung-Gesamtbetrag)' : ''),
      notes: notesM ? decodeEntities(notesM[1]).replace(/^"|"$/g, '') : '',
      logoUrl: logoM ? logoM[1] : '',
    })
  }
  return rows
}

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
function fmtAmount(n) {
  return n.toFixed(2).replace('.', ',')
}
function csvField(s) {
  const v = String(s ?? '')
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

const all = FILES.flatMap(extractFile)

// Dedup by PayPal transaction id (export ranges shouldn't overlap, but be safe).
const seen = new Map()
for (const r of all) if (!seen.has(r.id)) seen.set(r.id, r)
const rows = [...seen.values()].sort((a, b) => b.date.getTime() - a.date.getTime())

const header = ['Datum', 'Betrag', 'Gegenpartei', 'Buchungstext', 'Notiz', 'TransaktionsID', 'LogoUrl']
const lines = [header.join(';')]
for (const r of rows) {
  lines.push([fmtDate(r.date), fmtAmount(r.amount), csvField(r.counterparty), csvField(r.label), csvField(r.notes), r.id, r.logoUrl].join(';'))
}
writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8')

console.log(`Extracted ${rows.length} PayPal transactions (from ${all.length} raw entries across ${FILES.length} files) -> ${OUT_PATH}`)
const ratenzahlung = rows.filter(r => r.label.includes('Ratenzahlung-Gesamtbetrag')).length
if (ratenzahlung) console.log(`Note: ${ratenzahlung} entries are "Ratenzahlung" summary totals (no single matching bank debit) — kept for reference, flagged in Buchungstext.`)
