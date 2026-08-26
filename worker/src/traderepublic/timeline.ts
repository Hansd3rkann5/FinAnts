// Fetches Trade Republic's transaction timeline over its WebSocket pub/sub
// API and maps events straight to FinAnts' Transaction shape — no CSV
// intermediate. Ported from pytr's api.py (connection/subscribe protocol)
// and event.py (event_type → category). For category/amount, the simple
// `amount.value` field present on every list item is enough — no detail
// fetch needed. For trade events specifically, the depot-chart feature also
// needs the ISIN + share count: ISIN comes for free from the list item's
// `icon` field ("logos/<ISIN>/v2"), but share count is only present in the
// per-event detail (timelineDetailV2) response, nested under a UI-text-keyed
// table ("Transaktion" row → nested table → "Aktien"/"Anteile" row). That one
// narrow extraction is the only UI-text-dependent parsing kept from pytr's
// much larger (826-line) generic event.py — everything else there handles
// event types/edge cases this app doesn't need.

export interface TrTimelineTransaction {
  date: string          // ISO timestamp
  amount: number
  description: string   // title
  counterparty: string  // subtitle, falling back to title
  reference?: string
  categoryId: string
  isin?: string
  /** Signed: positive for a buy (shares acquired), negative for a sell. */
  shares?: number
}

interface TrEventItem {
  id: string
  title: string
  subtitle?: string
  timestamp: string
  eventType?: string
  amount?: { value: number; currency: string }
  action?: { type: string; payload?: string }
  icon?: string
}

// Mirrors pytr's tr_event_type_mapping, collapsed to FinAnts categories —
// buy/sell don't need to be distinguished since both land in 'savings'.
//
// TR ships the same logical event under different casings over time (e.g.
// `trading_trade_executed` → `TRADING_TRADE_EXECUTED`, `card_successful_
// transaction` → `CARD_TRANSACTION`), and a lowercase-only entry silently
// stops matching the moment they rename it uppercase — which is exactly how
// every stock trade got dropped from the import (empty depot chart). So all
// sets are uppercased at definition and every lookup uppercases its input,
// making the mapping case-insensitive and immune to that rename churn.
const up = (arr: string[]) => new Set(arr.map(s => s.toUpperCase()))

const DEPOSIT_TYPES = up([
  'ACCOUNT_TRANSFER_INCOMING', 'INCOMING_TRANSFER', 'INCOMING_TRANSFER_DELEGATION',
  'PAYMENT_INBOUND', 'PAYMENT_INBOUND_APPLE_PAY', 'PAYMENT_INBOUND_GOOGLE_PAY',
  'PAYMENT_INBOUND_SEPA_DIRECT_DEBIT', 'PAYMENT_INBOUND_CREDIT_CARD',
  'PAYMENT-SERVICE-IN-PAYMENT-DIRECT-DEBIT', 'card_refund', 'card_successful_oct', 'card_tr_refund',
  'BANK_TRANSACTION_INCOMING',
])
const REMOVAL_TYPES = up([
  'OUTGOING_TRANSFER', 'OUTGOING_TRANSFER_DELEGATION', 'PAYMENT_OUTBOUND',
  'card_failed_transaction', 'card_order_billed', 'card_successful_atm_withdrawal',
  'card_successful_transaction', 'junior_p2p_transfer',
  'BANK_TRANSACTION_OUTGOING',
])
const DIVIDEND_TYPES = up(['CREDIT'])
const INTEREST_TYPES = up(['INTEREST_PAYOUT', 'INTEREST_PAYOUT_CREATED'])
const TAX_REFUND_TYPES = up(['TAX_CORRECTION', 'TAX_REFUND', 'ssp_tax_correction_invoice'])
const TRADE_TYPES = up([
  'IPO_TRADE_EXECUTED', 'ORDER_EXECUTED', 'SAVINGS_PLAN_EXECUTED', 'SAVINGS_PLAN_INVOICE_CREATED',
  'TRADE_CORRECTED', 'TRADE_INVOICE', 'benefits_spare_change_execution',
  'trading_savingsplan_executed', 'trading_trade_executed',
])
const SAVEBACK_TYPES = up(['ACQUISITION_TRADE_PERK', 'benefits_saveback_execution'])
const PRIVATE_MARKETS_TYPES = up(['private_markets_order_created', 'private_markets_trade_executed'])
const CARD_PURCHASE_TYPES = up(['CARD_TRANSACTION', 'CARD_SUCCESSFUL_TRANSACTION'])
const CARD_FEE_TYPES = up(['CARD_ORDER_FEE', 'CARD_FAILED_TRANSACTION'])

// Non-financial timeline noise (identity checks, document acceptance, etc.)
// — pytr's events_known_ignored list, trimmed to what's worth carrying over.
const IGNORED_TYPES = up([
  'AML_SOURCE_OF_WEALTH_RESPONSE_EXECUTED', 'CASH_ACCOUNT_CHANGED', 'CREDIT_CANCELED',
  'CUSTOMER_CREATED', 'CRYPTO_ANNUAL_STATEMENT', 'CSX_CHAT_ACTIVITY', 'DEVICE_RESET',
  'DOCUMENTS_ACCEPTED', 'DOCUMENTS_CHANGED', 'DOCUMENTS_CREATED', 'EMAIL_VALIDATED',
  'EX_POST_COST_REPORT', 'EX_POST_COST_REPORT_CREATED', 'EXEMPTION_ORDER_CHANGE_REQUESTED',
  'EXEMPTION_ORDER_CHANGE_REQUESTED_AUTOMATICALLY', 'EXEMPTION_ORDER_CHANGED',
  'INPAYMENTS_SEPA_MANDATE_CREATED', 'INSTRUCTION_CORPORATE_ACTION',
  'JUNIOR_ONBOARDING_GUARDIAN_B_CONSENT', 'GENERAL_MEETING', 'GESH_CORPORATE_ACTION', 'MATURITY',
  'ORDER_CANCELED', 'ORDER_CREATED', 'ORDER_EXPIRED', 'ORDER_REJECTED',
  'PRE_DETERMINED_TAX_BASE_EARNING', 'PUK_CREATED', 'QUARTERLY_REPORT', 'RDD_FLOW',
  'REFERENCE_ACCOUNT_CHANGED', 'REFERRAL_FIRST_TRADE_EXECUTED_INVITEE',
  'SECURITIES_ACCOUNT_CREATED', 'SHAREBOOKING', 'SHAREBOOKING_TRANSACTIONAL',
  'STOCK_PERK_REFUNDED', 'TAX_YEAR_END_REPORT', 'TAX_YEAR_END_REPORT_CREATED',
  'VERIFICATION_TRANSFER_ACCEPTED', 'YEAR_END_TAX_REPORT', 'card_failed_verification',
  'card_successful_verification', 'crypto_annual_statement', 'current_account_activated',
  'new_tr_iban', 'private_markets_suitability_quiz_completed', 'ssp_general_meeting_customer_instruction',
  'ssp_tender_offer_customer_instruction', 'trading_order_cancelled', 'trading_order_created',
  'trading_order_expired', 'trading_order_rejected', 'trading_savingsplan_execution_failed',
  'ssp_capital_increase_customer_instruction', 'ssp_corporate_action_informative_notification',
  'ssp_dividend_option_customer_instruction',
])

function categoryForEventType(eventType: string | undefined, subtitle: string | undefined): string | null {
  const t = (eventType ?? '').toUpperCase()
  if (IGNORED_TYPES.has(t)) return null
  if (DEPOSIT_TYPES.has(t) || REMOVAL_TYPES.has(t)) return 'transfer'
  if (DIVIDEND_TYPES.has(t) || INTEREST_TYPES.has(t) || TAX_REFUND_TYPES.has(t)) return 'income'
  if (TRADE_TYPES.has(t) || SAVEBACK_TYPES.has(t) || PRIVATE_MARKETS_TYPES.has(t)) return 'savings'
  if (CARD_PURCHASE_TYPES.has(t)) return 'other'
  if (CARD_FEE_TYPES.has(t)) return 'fees'
  if (subtitle === 'Vorabpauschale') return 'fees'
  if (subtitle === 'Saveback') return 'savings'
  // Unknown type, not explicitly ignored — only carry it over if it actually
  // moved money; otherwise it's almost certainly more undocumented noise.
  return null
}

// "logos/US0378331005/v2" -> "US0378331005". Present directly on the list
// item for every trade event — no detail fetch needed for this part.
function extractIsin(icon: string | undefined): string | undefined {
  const parts = icon?.split('/')
  return parts && parts.length >= 2 ? parts[1] : undefined
}

function mapEvent(item: TrEventItem): TrTimelineTransaction | null {
  const categoryId = categoryForEventType(item.eventType, item.subtitle)
  if (!categoryId) return null
  const amount = item.amount?.value
  if (amount === undefined || amount === null || amount === 0) return null
  return {
    date: item.timestamp,
    amount,
    description: item.title,
    counterparty: item.subtitle || item.title,
    reference: item.eventType,
    categoryId,
    isin: TRADE_TYPES.has((item.eventType ?? '').toUpperCase()) ? extractIsin(item.icon) : undefined,
  }
}

// ─── Share count extraction (trade events only) ────────────────────────────
//
// timelineDetailV2's "Übersicht" table has a "Transaktion" row whose detail
// drills into a *nested* table (shown as a bottom sheet in the app) with
// separate "Aktienkurs"/"Aktien" (or "Anteile" for funds)/"Summe" rows — the
// "Aktien"/"Anteile" row's text is the one clean, narrowly-scoped piece of
// UI-text parsing this needs (see module comment).
interface DetailTableRow {
  title?: string
  detail?: { text?: string; action?: { payload?: { sections?: DetailSection[] } } }
}
interface DetailSection {
  title?: string
  type?: string
  data?: DetailTableRow[]
}

function parseGermanNumber(text: string): number | undefined {
  const cleaned = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? undefined : n
}

function extractShares(detail: { sections?: DetailSection[] }): number | undefined {
  for (const section of detail.sections ?? []) {
    if (section.type !== 'table') continue
    const txRow = section.data?.find(row => row.title === 'Transaktion')
    const nestedSections = txRow?.detail?.action?.payload?.sections
    for (const nested of nestedSections ?? []) {
      if (nested.type !== 'table') continue
      const sharesRow = nested.data?.find(row => row.title === 'Aktien' || row.title === 'Anteile')
      if (sharesRow?.detail?.text) {
        const n = parseGermanNumber(sharesRow.detail.text)
        if (n !== undefined) return n
      }
    }
  }
  return undefined
}

// ─── WebSocket pub/sub plumbing ─────────────────────────────────────────────

interface PendingSub {
  resolve: (payload: unknown) => void
  reject: (err: Error) => void
}

export class TrSocket {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<string, PendingSub>()
  private connected: Promise<void>

  constructor(ws: WebSocket) {
    this.ws = ws
    this.connected = new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        const text = typeof ev.data === 'string' ? ev.data : ''
        if (text === 'connected') {
          this.ws.removeEventListener('message', onMessage)
          resolve()
        }
      }
      this.ws.addEventListener('message', onMessage)
      this.ws.addEventListener('error', () => reject(new Error('WebSocket connect error')))
      this.ws.addEventListener('close', () => reject(new Error('WebSocket closed before connect')))
    })
    this.ws.addEventListener('message', ev => this.onMessage(ev))
  }

  private onMessage(ev: MessageEvent) {
    const text = typeof ev.data === 'string' ? ev.data : ''
    if (!text || text === 'connected') return
    const spaceIdx = text.indexOf(' ')
    if (spaceIdx < 0) return
    const id = text.slice(0, spaceIdx)
    const code = text[spaceIdx + 1]
    const payloadStr = text.slice(spaceIdx + 2).trimStart()
    const pending = this.pending.get(id)
    if (!pending) return

    if (code === 'A') {
      this.pending.delete(id)
      try { pending.resolve(payloadStr ? JSON.parse(payloadStr) : {}) } catch (e) { pending.reject(e as Error) }
    } else if (code === 'E') {
      this.pending.delete(id)
      pending.reject(new Error(`TR subscription error: ${payloadStr.slice(0, 300)}`))
    }
    // 'D' (delta) and 'C' (close ack) are irrelevant for our one-shot
    // subscribe→answer→unsubscribe pattern — we never stay subscribed long
    // enough to receive a delta.
  }

  async waitConnected(): Promise<void> {
    await this.connected
  }

  async subscribeOnce(payload: Record<string, unknown>, timeoutMs = 15_000): Promise<unknown> {
    const id = String(this.nextId++)
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('TR subscription timed out')) }
      }, timeoutMs)
    })
    this.ws.send(`sub ${id} ${JSON.stringify(payload)}`)
    try {
      return await result
    } finally {
      this.ws.send(`unsub ${id}`)
    }
  }

  close() {
    this.ws.close()
  }
}

export async function connectTrWebSocket(cookies: string[]): Promise<TrSocket> {
  const cookieHeader = cookies.join('; ')
  const resp = await fetch('https://api.traderepublic.com/', {
    headers: { Upgrade: 'websocket', Cookie: cookieHeader },
  })
  const ws = resp.webSocket
  if (!ws) throw new Error(`TR WebSocket upgrade failed (HTTP ${resp.status})`)
  ws.accept()

  const connectionMessage = {
    locale: 'de',
    platformId: 'webtrading',
    platformVersion: 'chrome - 94.0.4606',
    clientId: 'app.traderepublic.com',
    clientVersion: '5582',
  }
  ws.send(`connect 31 ${JSON.stringify(connectionMessage)}`)

  const socket = new TrSocket(ws)
  await socket.waitConnected()
  return socket
}

interface TimelinePage {
  items: TrEventItem[]
  cursors?: { after?: string | null }
}

async function fetchAllPages(socket: TrSocket, type: 'timelineTransactions' | 'timelineActivityLog'): Promise<TrEventItem[]> {
  const all: TrEventItem[] = []
  let after: string | null = null
  for (let page = 0; page < 200; page++) {
    const response = await socket.subscribeOnce({ type, after }) as TimelinePage
    if (!response.items?.length) break
    all.push(...response.items)
    after = response.cursors?.after ?? null
    if (!after) break
  }
  return all
}

// Fetches the full transaction + activity timeline and maps it directly to
// FinAnts transactions, skipping non-financial noise. For trade events, also
// fetches each one's detail (timelineDetailV2) to extract the share count —
// see the module comment for why only trades pay this extra round-trip cost.
export async function fetchTradeRepublicTransactions(cookies: string[]): Promise<TrTimelineTransaction[]> {
  const socket = await connectTrWebSocket(cookies)
  try {
    const [transactions, activity] = await Promise.all([
      fetchAllPages(socket, 'timelineTransactions'),
      fetchAllPages(socket, 'timelineActivityLog'),
    ])
    const byId = new Map<string, TrEventItem>()
    for (const item of [...transactions, ...activity]) byId.set(item.id, item)

    const mapped: TrTimelineTransaction[] = []
    await Promise.all([...byId.entries()].map(async ([id, item]) => {
      const tx = mapEvent(item)
      if (!tx) return
      if (tx.isin) {
        try {
          const detail = await socket.subscribeOnce({ type: 'timelineDetailV2', id }) as { sections?: DetailSection[] }
          const shares = extractShares(detail)
          if (shares !== undefined) tx.shares = tx.amount < 0 ? shares : -shares
        } catch {
          // Missing share count just means the position-history chart skips
          // this one event — the transaction itself (already mapped) is unaffected.
        }
      }
      mapped.push(tx)
    }))

    return mapped
  } finally {
    socket.close()
  }
}
