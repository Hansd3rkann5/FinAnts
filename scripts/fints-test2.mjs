/**
 * FinTS connectivity test #2 — using the well-tested `lib-fints` library
 * instead of the hand-rolled client in fints-test.mjs (which turned out to
 * be missing required security/encryption wrapper segments and never
 * actually validated the PIN). This one correctly builds the FinTS message
 * structure and can decode a photoTAN challenge image so you can scan it
 * with your banking app, then submit the resulting TAN to complete sync.
 *
 * NOT wired into the app or worker — standalone exploration only.
 *
 * Usage:
 *   node --env-file=.env.fints.local scripts/fints-test2.mjs
 *
 * Note: FinTS technically requires a product ID registered with the German
 * banking industry (https://www.hbci-zka.de/register/prod_register.htm,
 * takes ~5-10 business days). This script uses a placeholder ID for this
 * one-off exploratory test — set FINTS_PRODUCT_ID in .env.fints.local once
 * you have a real one, before relying on this for anything ongoing.
 */
import { createInterface } from 'node:readline/promises'
import { writeFile } from 'node:fs/promises'
import { FinTSConfig, FinTSClient } from 'lib-fints'

const BLZ        = process.env.FINTS_BLZ
const USERNAME   = process.env.FINTS_USERNAME
const PIN        = process.env.FINTS_PIN
const URL        = process.env.FINTS_URL ?? 'https://fints.commerzbank.de/fints'
const PRODUCT_ID = process.env.FINTS_PRODUCT_ID ?? 'FINANTSTEST0001'

if (!BLZ || !USERNAME || !PIN) {
  console.error('Missing FINTS_BLZ / FINTS_USERNAME / FINTS_PIN — see .env.fints.local.example')
  process.exit(1)
}
if (PRODUCT_ID === 'FINANTSTEST0001') {
  console.log('⚠ Using a placeholder (unregistered) product ID for this one-off test.')
  console.log('  Register a real one for ongoing use: https://www.hbci-zka.de/register/prod_register.htm\n')
}

const rl = createInterface({ input: process.stdin, output: process.stdout })

function report(label, response) {
  console.log(`\n[${label}] success=${response.success} requiresTan=${response.requiresTan}`)
  for (const a of response.bankAnswers ?? []) {
    console.log(`  · ${a.code}: ${a.text}`)
  }
}

const config = FinTSConfig.forFirstTimeUse(PRODUCT_ID, '1.0', URL, BLZ, USERNAME, PIN)
const client = new FinTSClient(config)

console.log(`→ Synchronizing with ${URL} (BLZ=${BLZ}, username=${USERNAME})…`)

let response
try {
  response = await client.synchronize()
} catch (e) {
  console.error(`\n✗ Request failed: ${e.message}`)
  rl.close()
  process.exit(1)
}

report('synchronize', response)

if (response.requiresTan) {
  if (response.tanChallenge) console.log(`\nBank says: "${response.tanChallenge}"`)

  if (response.tanPhoto) {
    const ext = response.tanPhoto.mimeType.includes('png') ? 'png' : 'jpg'
    const path = `/tmp/fints-photo-tan.${ext}`
    await writeFile(path, response.tanPhoto.image)
    console.log(`\n📷 photoTAN image saved to ${path} — open it, scan with your banking app.`)
  }

  const tan = (await rl.question('\nEnter the TAN from your app (leave empty if decoupled/auto-confirmed): ')).trim()
  response = await client.synchronizeWithTan(response.tanReference, tan || undefined)
  report('synchronizeWithTan', response)
}

if (response.success && !response.requiresTan) {
  console.log('\n✓ Synchronized successfully.')
  const bpd = config.bankingInformation.bpd
  console.log(`  Bank: ${bpd?.bankName ?? '?'}`)
  const methods = config.availableTanMethods
  console.log(`  Available TAN methods: ${methods.length ? methods.map(m => `${m.id}:${m.name}`).join(', ') : '(none yet)'}`)
  const accounts = config.bankingInformation.upd?.bankAccounts ?? []
  if (accounts.length) {
    console.log(`  Accounts (${accounts.length}):`)
    for (const a of accounts) console.log(`    · ${a.iban ?? a.accountNumber} (${a.product ?? a.accountType})`)
  } else {
    console.log('  No account details yet — select a TAN method (config.availableTanMethods) and synchronize again.')
  }
} else if (!response.success) {
  console.log('\n✗ Did not succeed — see bank answers above.')
}

rl.close()
