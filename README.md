# FinAnts – Persönlicher Finanztracker

Dark-Mode PWA für iPhone optimiert. Importiert Commerzbank-Buchungen, kategorisiert sie automatisch und zeigt Tortendiagramme nach Zeitraum.

## Features

- Automatischer Sync per Cloudflare Worker (FinTS/HBCI)
- CSV/MT940-Import (manueller Commerzbank-Export)
- Auto-Kategorisierung (15 Kategorien, 50+ Händler)
- Logos bekannter Händler (REWE, Spotify, Netflix …)
- Dauerauftrags-Erkennung
- Woche / Monat / Jahr / Alles Filter
- Alle Daten lokal im Browser (kein Server, kein Tracking)

---

## 1 · App auf GitHub Pages deployen

```bash
# Repository auf GitHub erstellen (Name: FinAnts), dann:
git remote add origin https://github.com/DEIN_USER/FinAnts.git
git push -u origin main

# GitHub → Settings → Pages → Source: GitHub Actions
# Der Workflow baut und deployt automatisch bei jedem Push auf main.
```

App läuft danach unter: `https://DEIN_USER.github.io/FinAnts/`

---

## 2 · Cloudflare Worker für Live-Sync einrichten

Der Worker verbindet sich per FinTS 3.0 direkt mit dem Commerzbank-Server.  
Deine Zugangsdaten werden **ausschließlich als verschlüsselte Cloudflare Secrets** gespeichert – niemals im Code.

### Voraussetzungen

- [Node.js 18+](https://nodejs.org/)
- Kostenloses [Cloudflare-Konto](https://cloudflare.com)

### Schritt für Schritt

```bash
# 1. Wrangler CLI installieren
npm install -g wrangler

# 2. Bei Cloudflare anmelden (öffnet Browser)
wrangler login

# 3. In den Worker-Ordner wechseln
cd worker
npm install

# 4. wrangler.toml anpassen: ALLOWED_ORIGIN auf deine GitHub-Pages-URL setzen
#    z.B. ALLOWED_ORIGIN = "https://dein_user.github.io"

# 5. Secrets setzen (du wirst jeweils nach dem Wert gefragt)
wrangler secret put FINTS_IBAN        # z.B. DE89200411001234567890
wrangler secret put FINTS_USERNAME    # Commerzbank OnlineBanking-Benutzername
wrangler secret put FINTS_PIN         # Commerzbank OnlineBanking-PIN
wrangler secret put API_KEY           # Selbst gewählter geheimer Schlüssel (z.B. 32 Zufallszeichen)

# 6. Deployen
wrangler deploy
# → Gibt die Worker-URL aus, z.B.:
#   https://finants-proxy.dein-account.workers.dev
```

### In der App eintragen

Öffne die App → **Einstellungen** → **Automatischer Sync**:
- **Worker-URL**: die URL aus Schritt 6
- **API Key**: der Wert aus `wrangler secret put API_KEY`
- Tippe **Jetzt synchronisieren**

---

## 3 · Lokale Entwicklung

```bash
# App
npm install
npm run dev          # → http://localhost:5173/FinAnts/

# Worker (lokal testen, Secrets aus .dev.vars lesen)
cd worker
cp .dev.vars.example .dev.vars   # Werte eintragen
npm run dev          # → http://localhost:8787
```

### worker/.dev.vars (für lokale Tests, nie committen)

```
FINTS_IBAN=DE89200411001234567890
FINTS_USERNAME=dein_benutzername
FINTS_PIN=dein_pin
API_KEY=test-key-lokal
ALLOWED_ORIGIN=http://localhost:5173
```

---

## Technischer Stack

| Schicht | Technologie |
|---------|-------------|
| Frontend | React 19, TypeScript 5.7, Vite 8 |
| Styling | Tailwind CSS v4, Framer Motion |
| Charts | Recharts 3 |
| Daten | localStorage (kein Backend) |
| Sync-Proxy | Cloudflare Worker (FinTS 3.0) |
| Deployment | GitHub Pages + GitHub Actions |

## Datenschutz

- Die App speichert **keine** Daten auf externen Servern.
- Der Cloudflare Worker agiert als reiner Proxy – er speichert keine Transaktionen.
- Zugangsdaten liegen **ausschließlich** als Cloudflare Secrets in deinem eigenen Account.
