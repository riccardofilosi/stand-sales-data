import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Gli end-to-end parlano con il database VERO: usano l'account di prova di
 * `.env.test.local`, lo stesso della suite di attacco. Lasciano dietro qualche
 * ordine nella sessione aperta — non è una suite da lanciare su un'edizione i
 * cui totali contano.
 *
 * Le variabili si leggono a mano perché non c'è dotenv fra le dipendenze, e
 * aggiungerlo per quattro righe sarebbe un pacchetto in più da tenere
 * aggiornato per sempre.
 */
try {
  for (const riga of readFileSync('.env.test.local', 'utf8').split('\n')) {
    const taglio = riga.indexOf('=')
    if (taglio < 1 || riga.trimStart().startsWith('#')) continue
    const nome = riga.slice(0, taglio).trim()
    if (!process.env[nome]) process.env[nome] = riga.slice(taglio + 1).trim()
  }
} catch {
  // Senza il file la suite si ferma da sola nel primo test, dicendo cosa manca.
}

export default defineConfig({
  testDir: 'tests/e2e',
  // Uno per volta: due browser che battono ordini sulla stessa edizione
  // renderebbero illeggibile ogni conteggio.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:5173',
    // Il telefono è il bersaglio: provarla a 1280 vorrebbe dire provare
    // un'altra app.
    ...devices['Pixel 7'],
    // Il browser completo invece dello «headless shell», che è un secondo
    // binario da scaricare a parte. Qui non serve: pesa di più all'avvio e
    // basta e avanza per cinque prove.
    channel: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'telefono' }],
})
