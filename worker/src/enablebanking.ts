const EB_API = 'https://api.enablebanking.com'

// ─── Internal EB types ─────────────────────────────────────────────────────

interface EbAccountResource {
  uid: string
  identification?: { iban?: string }
  name?: string
  currency: string
  owner_name?: string
  balances?: { balance_amount: { amount: string; currency: string }; balance_type: string }[]
}

interface EbTransaction {
  booking_date?: string
  transaction_date?: string
  transaction_amount: { amount: string; currency: string }
  creditor?: { name?: string }
  creditor_account?: { iban?: string }
  debtor?: { name?: string }
  debtor_account?: { iban?: string }
  remittance_information?: string[]
  credit_debit_indicator?: string
}

// ─── Mapped types (match existing worker format) ───────────────────────────

export interface MappedAccount {
  iban: string; blz: string; accountNumber: string; owner: string
  description: string; type: string; currency: string; balance: number; balanceDate: string
}

export interface MappedTransaction {
  date: string; amount: number; description: string
  counterparty: string; counterpartyIban: string; accountIban: string
}

// ─── JWT helper ────────────────────────────────────────────────────────────

async function makeJwt(applicationId: string, privateKeyPem: string): Promise<string> {
  console.log('[EB] makeJwt: building JWT for app', applicationId)

  const pemBody = privateKeyPem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  console.log('[EB] makeJwt: PEM body length after strip:', pemBody.length)

  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['sign'],
  )
  console.log('[EB] makeJwt: key imported successfully')

  const now = Math.floor(Date.now() / 1000)
  const b64u = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const header  = b64u({ alg: 'RS256', typ: 'JWT', kid: applicationId })
  const payload = b64u({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600, app: applicationId })

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  console.log('[EB] makeJwt: JWT signed, token length:', `${header}.${payload}.${sigB64}`.length)
  return `${header}.${payload}.${sigB64}`
}

async function ebFetch(path: string, appId: string, privKey: string, init?: RequestInit): Promise<Response> {
  console.log('[EB] ebFetch:', init?.method ?? 'GET', path)
  const jwt = await makeJwt(appId, privKey)
  const res = await fetch(`${EB_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  console.log('[EB] ebFetch response:', res.status, path)
  return res
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function ebGetAspsps(appId: string, privKey: string, country: string, search?: string): Promise<unknown> {
  const res = await ebFetch(`/aspsps?country=${country}`, appId, privKey)
  if (!res.ok) throw new Error(`GET /aspsps failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { aspsps?: { name: string; country: string; psu_types?: string[] }[] }
  if (search && data.aspsps) {
    const q = search.toLowerCase()
    return { aspsps: data.aspsps.filter(a => a.name.toLowerCase().includes(q)) }
  }
  return data
}

// Step 1: Start authorization → returns URL to redirect user to
export async function ebStartAuth(
  appId: string,
  privKey: string,
  redirectUrl: string,
  aspspName: string,
  aspspCountry: string,
): Promise<{ authorization_id: string; auth_url: string }> {
  console.log('[EB] ebStartAuth: aspsp=', aspspName, aspspCountry, 'redirect=', redirectUrl)

  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const res = await ebFetch('/auth', appId, privKey, {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: aspspName, country: aspspCountry },
      state: crypto.randomUUID(),
      redirect_url: redirectUrl,
      psu_type: 'personal',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[EB] ebStartAuth failed:', res.status, body)
    throw new Error(`Auth start failed (${res.status}): ${body}`)
  }

  const data = await res.json() as { url: string; authorization_id: string }
  console.log('[EB] ebStartAuth success: authorization_id=', data.authorization_id)
  return { authorization_id: data.authorization_id, auth_url: data.url }
}

// Step 2: Exchange authorization code for session + fetch transactions
export async function ebExchangeAndSync(
  appId: string,
  privKey: string,
  code: string,
  fromDate: Date,
  toDate: Date,
): Promise<{ accounts: MappedAccount[]; transactions: MappedTransaction[] }> {
  console.log('[EB] ebExchangeAndSync: exchanging code for session')

  // Exchange code → session
  const sessRes = await ebFetch('/sessions', appId, privKey, {
    method: 'POST',
    body: JSON.stringify({ code }),
  })

  if (!sessRes.ok) {
    const body = await sessRes.text()
    console.error('[EB] session exchange failed:', sessRes.status, body)
    throw new Error(`Session exchange failed (${sessRes.status}): ${body}`)
  }

  const session = await sessRes.json() as { session_id: string; accounts?: EbAccountResource[] }
  console.log('[EB] session_id=', session.session_id, '| accounts in response:', session.accounts?.length ?? 0)

  const accounts = session.accounts ?? []
  if (accounts.length === 0) throw new Error('Keine autorisierten Konten in der Session')

  const dateFrom = fromDate.toISOString().slice(0, 10)
  const dateTo   = toDate.toISOString().slice(0, 10)
  console.log('[EB] date range', dateFrom, '→', dateTo)

  const mappedAccounts: MappedAccount[]         = []
  const mappedTransactions: MappedTransaction[] = []

  // The continuation_key returned by EnableBanking contains the bank's internal
  // accountId (e.g. Commerzbank's XS2A ID), which differs from the EB session UID.
  // Passing the session UID for subsequent pages causes a 422. We decode the key
  // to extract the correct accountId for pagination requests.
  function ckAccountId(ck: string): string | null {
    try {
      const b64 = ck.split('.')[0]
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
      const decoded = JSON.parse(atob(padded)) as { params?: { accountId?: string } }
      return decoded.params?.accountId ?? null
    } catch { return null }
  }

  await Promise.all(accounts.map(async acct => {
    console.log('[EB] account raw:', JSON.stringify(acct))

    // Fetch full account details — the session response sometimes omits IBAN
    // and balances for certain banks (e.g. Commerzbank via XS2A).
    let detailIban = acct.identification?.iban
    let balances = acct.balances ?? []

    const detailRes = await ebFetch(`/accounts/${acct.uid}`, appId, privKey)
    if (detailRes.ok) {
      const detail = await detailRes.json() as EbAccountResource
      console.log('[EB] account detail:', JSON.stringify(detail))
      detailIban ??= detail.identification?.iban
      if (detail.balances?.length) balances = detail.balances
    } else {
      console.warn('[EB] account detail fetch failed:', detailRes.status)
    }

    // Fetch balances separately if still missing
    if (!balances.length) {
      const balRes = await ebFetch(`/accounts/${acct.uid}/balances`, appId, privKey)
      if (balRes.ok) {
        const balData = await balRes.json() as { balances?: EbAccountResource['balances'] }
        balances = balData.balances ?? []
        console.log('[EB] balances fetched separately:', JSON.stringify(balances))
      } else {
        console.warn('[EB] balance fetch failed:', balRes.status)
      }
    }

    const iban = detailIban ?? acct.uid
    console.log('[EB] resolved iban:', iban)

    const txRes = await ebFetch(
      `/accounts/${acct.uid}/transactions?date_from=${dateFrom}&date_to=${dateTo}`,
      appId, privKey,
    )

    if (!txRes.ok) {
      console.error('[EB] tx fetch failed for uid:', acct.uid, txRes.status, await txRes.text())
      return
    }

    // Paginate through all transactions
    const allTxs: EbTransaction[] = []
    let continuationKey: string | undefined

    const firstData = await txRes.json() as { transactions?: EbTransaction[]; continuation_key?: string }
    if (firstData.transactions?.[0]) {
      console.log('[EB] sample tx fields:', JSON.stringify(firstData.transactions[0]))
    }
    allTxs.push(...(firstData.transactions ?? []))
    continuationKey = firstData.continuation_key

    while (continuationKey) {
      const pageId = ckAccountId(continuationKey) ?? acct.uid
      console.log('[EB] fetching next page, pageId:', pageId, 'ck:', continuationKey.slice(0, 40) + '...')
      const pageRes = await ebFetch(
        `/accounts/${pageId}/transactions?continuation_key=${continuationKey}`,
        appId, privKey,
      )
      if (!pageRes.ok) {
        console.error('[EB] pagination failed:', pageRes.status, await pageRes.text())
        break
      }
      const pageData = await pageRes.json() as { transactions?: EbTransaction[]; continuation_key?: string }
      allTxs.push(...(pageData.transactions ?? []))
      continuationKey = pageData.continuation_key
    }

    console.log('[EB] account:', iban, '| total transactions:', allTxs.length)

    const closingBal = balances.find(b => b.balance_type === 'closingBooked') ?? balances[0]
    const isRealIban = /^[A-Z]{2}\d{2}/.test(iban)

    mappedAccounts.push({
      iban,
      blz:           isRealIban ? iban.slice(4, 12) : '',
      accountNumber: isRealIban ? iban.slice(12)    : iban,
      owner:         acct.owner_name ?? '',
      description:   (acct.name && acct.name !== acct.owner_name) ? acct.name : 'Girokonto',
      type:          'giro',
      currency:      acct.currency,
      balance:       closingBal ? parseFloat(closingBal.balance_amount.amount) : 0,
      balanceDate:   dateTo,
    })

    for (const tx of allTxs) {
      // EnableBanking reports the amount as a positive magnitude with the
      // direction in credit_debit_indicator (DBIT = outgoing). Apply the sign
      // so expenses are negative — otherwise everything reads as income.
      const rawAmount = parseFloat(tx.transaction_amount.amount)
      const isExpense = (tx.credit_debit_indicator === 'DBIT') || rawAmount < 0
      const amount    = isExpense ? -Math.abs(rawAmount) : Math.abs(rawAmount)
      mappedTransactions.push({
        date:             tx.booking_date ?? tx.transaction_date ?? '',
        amount,
        description:      tx.remittance_information?.join(' ') ?? '',
        counterparty:     isExpense ? (tx.creditor?.name ?? '') : (tx.debtor?.name ?? ''),
        counterpartyIban: isExpense ? (tx.creditor_account?.iban ?? '') : (tx.debtor_account?.iban ?? ''),
        accountIban:      iban,
      })
    }
  }))

  console.log('[EB] done: accounts=', mappedAccounts.length, 'transactions=', mappedTransactions.length)
  return { accounts: mappedAccounts, transactions: mappedTransactions }
}
