// Bank exports spell the same merchant inconsistently across umlaut/ASCII
// transliterations ("Bäckerei" vs "Baeckerei") and casing — fold both the
// input text and keywords through this before comparing, so a keyword only
// needs to be written once regardless of which spelling shows up.
export function fold(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
}

interface MerchantInfo {
  name: string
  domain: string
  keywords: string[]
  categoryOverride?: string
}

const MERCHANTS: MerchantInfo[] = [
  // Groceries
  { name: 'REWE',         domain: 'rewe.de',          keywords: ['rewe'],                           categoryOverride: 'groceries' },
  { name: 'EDEKA',        domain: 'edeka.de',          keywords: ['edeka', 'edk*e', 'e center', 'edeka center'], categoryOverride: 'groceries' },
  { name: 'ALDI',         domain: 'aldi.de',           keywords: ['aldi'],                           categoryOverride: 'groceries' },
  { name: 'LIDL',         domain: 'lidl.de',           keywords: ['lidl'],                           categoryOverride: 'groceries' },
  { name: 'Penny',        domain: 'penny.de',          keywords: ['penny'],                          categoryOverride: 'groceries' },
  { name: 'Netto',        domain: 'netto.de',          keywords: ['netto marken-discount', 'netto md'], categoryOverride: 'groceries' },
  { name: 'Kaufland',     domain: 'kaufland.de',       keywords: ['kaufland'],                       categoryOverride: 'groceries' },
  { name: 'dm',           domain: 'dm.de',             keywords: ['dm drogerie', 'dm-drogerie'],     categoryOverride: 'health' },
  { name: 'Rossmann',     domain: 'rossmann.de',       keywords: ['rossmann'],                       categoryOverride: 'health' },
  { name: 'Müller',       domain: 'mueller.de',        keywords: ['müller drog', 'mueller drog'],    categoryOverride: 'health' },
  { name: 'Norma',        domain: 'norma-online.de',   keywords: ['norma'],                          categoryOverride: 'groceries' },
  { name: 'Globus',       domain: 'globus.de',         keywords: ['globus'],                         categoryOverride: 'groceries' },
  // Food delivery & dining
  { name: 'Lieferando',   domain: 'lieferando.de',     keywords: ['lieferando', 'lieferheld'],       categoryOverride: 'dining' },
  { name: 'Uber Eats',    domain: 'ubereats.com',      keywords: ['uber eats', 'ubereats'],          categoryOverride: 'dining' },
  { name: 'McDonald\'s',  domain: 'mcdonalds.com',     keywords: ["mcdonald", "mc donald"],          categoryOverride: 'dining' },
  { name: 'Burger King',  domain: 'burgerking.de',     keywords: ['burger king'],                    categoryOverride: 'dining' },
  { name: 'Starbucks',    domain: 'starbucks.com',     keywords: ['starbucks'],                      categoryOverride: 'dining' },
  { name: 'Subway',       domain: 'subway.com',        keywords: ['subway'],                         categoryOverride: 'dining' },
  // Transport
  { name: 'Deutsche Bahn', domain: 'bahn.de',          keywords: ['deutsche bahn', 'db vertrieb', 'db bahn', 'db fernverkehr', 'bahn.de'], categoryOverride: 'transport' },
  { name: 'Uber',          domain: 'uber.com',          keywords: ['uber bv', 'uber trip'],          categoryOverride: 'transport' },
  { name: 'ADAC',          domain: 'adac.de',           keywords: ['adac'],                          categoryOverride: 'transport' },
  { name: 'Shell',         domain: 'shell.de',          keywords: ['shell tankst', 'shell station'], categoryOverride: 'transport' },
  { name: 'BP',            domain: 'bp.com',            keywords: ['bp tankst', ' bp '],             categoryOverride: 'transport' },
  { name: 'Aral',          domain: 'aral.de',           keywords: ['aral'],                          categoryOverride: 'transport' },
  { name: 'Esso',          domain: 'esso.de',           keywords: ['esso'],                          categoryOverride: 'transport' },
  { name: 'Flixbus',       domain: 'flixbus.de',        keywords: ['flixbus', 'flix se'],            categoryOverride: 'transport' },
  { name: 'Lime',          domain: 'li.me',             keywords: ['lime*'],                         categoryOverride: 'transport' },
  { name: 'Ryanair',       domain: 'ryanair.com',       keywords: ['ryanair'],                       categoryOverride: 'travel' },
  { name: 'Lufthansa',     domain: 'lufthansa.com',     keywords: ['lufthansa', 'dlh'],              categoryOverride: 'travel' },
  { name: 'Booking.com',   domain: 'booking.com',       keywords: ['booking.com', 'booking b.v'],   categoryOverride: 'travel' },
  { name: 'Airbnb',        domain: 'airbnb.com',        keywords: ['airbnb'],                        categoryOverride: 'travel' },
  // Streaming & subscriptions
  { name: 'Netflix',       domain: 'netflix.com',       keywords: ['netflix'],                       categoryOverride: 'subscriptions' },
  { name: 'Spotify',       domain: 'spotify.com',       keywords: ['spotify'],                       categoryOverride: 'subscriptions' },
  { name: 'Amazon Prime',  domain: 'amazon.de',         keywords: ['amazon prime', 'prime video'],  categoryOverride: 'subscriptions' },
  { name: 'Disney+',       domain: 'disneyplus.com',    keywords: ['disney plus', 'disney+'],        categoryOverride: 'subscriptions' },
  { name: 'Apple',         domain: 'apple.com',         keywords: ['apple.com', 'itunes', 'apple one'], categoryOverride: 'subscriptions' },
  { name: 'YouTube',       domain: 'youtube.com',       keywords: ['youtube premium', 'google youtube'], categoryOverride: 'subscriptions' },
  { name: 'Deezer',        domain: 'deezer.com',        keywords: ['deezer'],                        categoryOverride: 'subscriptions' },
  { name: 'Adobe',         domain: 'adobe.com',         keywords: ['adobe'],                         categoryOverride: 'subscriptions' },
  { name: 'Dropbox',       domain: 'dropbox.com',       keywords: ['dropbox'],                       categoryOverride: 'subscriptions' },
  // Shopping
  { name: 'Amazon',        domain: 'amazon.de',         keywords: ['amazon'],                        categoryOverride: 'shopping' },
  { name: 'Zalando',       domain: 'zalando.de',        keywords: ['zalando'],                       categoryOverride: 'shopping' },
  { name: 'Otto',          domain: 'otto.de',           keywords: ['otto gmbh', 'otto.de'],          categoryOverride: 'shopping' },
  { name: 'MediaMarkt',    domain: 'mediamarkt.de',     keywords: ['media markt', 'mediamarkt'],     categoryOverride: 'shopping' },
  { name: 'Saturn',        domain: 'saturn.de',         keywords: ['saturn'],                        categoryOverride: 'shopping' },
  { name: 'H&M',           domain: 'hm.com',            keywords: ['h&m', 'h & m'],                 categoryOverride: 'shopping' },
  { name: 'Zara',          domain: 'zara.com',          keywords: ['zara'],                          categoryOverride: 'shopping' },
  { name: 'IKEA',          domain: 'ikea.com',          keywords: ['ikea'],                          categoryOverride: 'shopping' },
  { name: 'eBay',          domain: 'ebay.de',           keywords: ['ebay'],                          categoryOverride: 'shopping' },
  { name: 'Vinted',        domain: 'vinted.de',         keywords: ['vinted'],                        categoryOverride: 'shopping' },
  { name: 'Klarna',        domain: 'klarna.com',        keywords: ['klarna'],                        categoryOverride: 'shopping' },
  { name: 'Riverty',       domain: 'riverty.com',       keywords: ['riverty'],                       categoryOverride: 'shopping' },
  // Pharma/health
  { name: 'DocMorris',     domain: 'docmorris.de',      keywords: ['docmorris', 'versandapo'],       categoryOverride: 'health' },
  // Groceries (regional chains)
  { name: 'Tegut',         domain: 'tegut.de',          keywords: ['tegut'],                         categoryOverride: 'groceries' },
  // Food delivery & dining
  { name: 'Yormas',        domain: 'yormas.de',         keywords: ['yormas'],                        categoryOverride: 'dining' },
  // Utilities & housing
  { name: 'Telekom',       domain: 'telekom.de',        keywords: ['telekom', 'dt ag'],              categoryOverride: 'housing' },
  { name: 'Vodafone',      domain: 'vodafone.de',       keywords: ['vodafone'],                      categoryOverride: 'housing' },
  { name: 'O2',            domain: 'o2online.de',       keywords: ['telefonica', 'o2 '],             categoryOverride: 'housing' },
  { name: '1&1',           domain: '1und1.de',          keywords: ['1&1', '1und1'],                  categoryOverride: 'housing' },
  // Insurance
  { name: 'HUK-COBURG',    domain: 'huk.de',            keywords: ['huk', 'huk-coburg'],             categoryOverride: 'insurance' },
  { name: 'Allianz',       domain: 'allianz.de',        keywords: ['allianz'],                       categoryOverride: 'insurance' },
  { name: 'AOK',           domain: 'aok.de',            keywords: ['aok'],                           categoryOverride: 'insurance' },
  { name: 'TK',            domain: 'tk.de',             keywords: ['techniker krank', 'tk krank'],   categoryOverride: 'insurance' },
  { name: 'Barmer',        domain: 'barmer.de',         keywords: ['barmer'],                        categoryOverride: 'insurance' },
  { name: 'BKK Firmus',    domain: 'bkkfirmus.de',      keywords: ['bkk firmus'],                    categoryOverride: 'insurance' },
  { name: 'SKD BKK',       domain: 'skdbkk.de',         keywords: ['skd bkk'],                       categoryOverride: 'insurance' },
  // Gaming & entertainment
  { name: 'Steam',         domain: 'steampowered.com',  keywords: ['steam', 'valve'],                categoryOverride: 'entertainment' },
  { name: 'PlayStation',   domain: 'playstation.com',   keywords: ['playstation', 'psn'],            categoryOverride: 'entertainment' },
  { name: 'Nintendo',      domain: 'nintendo.com',      keywords: ['nintendo'],                      categoryOverride: 'entertainment' },
  // PayPal (pass-through, no override)
  { name: 'PayPal',        domain: 'paypal.com',        keywords: ['paypal'],                        categoryOverride: undefined },
]

export interface MerchantMatch {
  merchantKey: string
  name: string
  logoUrl: string
  categoryOverride?: string
}

const LOGOS_TOKEN = import.meta.env.VITE_LOGOS_TOKEN ?? ''
console.log('[logos.dev] token present:', !!LOGOS_TOKEN, LOGOS_TOKEN ? `(${LOGOS_TOKEN.slice(0, 6)}…)` : '(missing)')

export function findMerchant(text: string): MerchantMatch | null {
  const lower = fold(text)
  for (const m of MERCHANTS) {
    if (m.keywords.some(k => lower.includes(fold(k)))) {
      return {
        merchantKey: m.domain,
        name: m.name,
        logoUrl: `https://img.logo.dev/${m.domain}?token=${LOGOS_TOKEN}&size=128&format=png`,
        categoryOverride: m.categoryOverride,
      }
    }
  }
  return null
}

export function getLogoUrl(domain: string): string {
  return `https://img.logo.dev/${domain}?token=${LOGOS_TOKEN}&size=128&format=png`
}
