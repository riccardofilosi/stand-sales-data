import { test, expect } from '@playwright/test'

/**
 * Che l'app sia davvero installabile, e davvero offline.
 *
 * Gira sulla BUILD, non sul server di sviluppo: il service worker lo genera
 * `vite-plugin-pwa` in build, e senza di lui non c'è né installazione né
 * ricaricamento a rete staccata.
 *
 * Gira su `localhost`, che è contesto sicuro tanto quanto HTTPS: è l'unico
 * modo di provare tutto questo senza pubblicare niente da nessuna parte.
 *
 *   npm run build && npm run preview -- --port 4180
 *   E2E_URL=http://localhost:4180 npx playwright test installabile
 */

test.describe('la PWA', () => {
  test('è in contesto sicuro, quindi può registrare un service worker', async ({ page }) => {
    await page.goto('/')
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true)
    expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(true)

    // Qui `crypto.randomUUID` c'è: il ripiego in lib/ordine.ts serve solo
    // quando si apre l'app da un indirizzo di rete in chiaro.
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('function')
  })

  test('il service worker prende servizio e mette in cache l app', async ({ page }) => {
    await page.goto('/')
    const attivo = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return Boolean(reg.active)
    })
    expect(attivo).toBe(true)

    const inCache = await page.evaluate(async () => {
      const nomi = await caches.keys()
      let quante = 0
      for (const n of nomi) quante += (await caches.open(n).then((c) => c.keys())).length
      return quante
    })
    // Venti voci precaricate: l'app, i fogli di stile, il carattere.
    expect(inCache).toBeGreaterThan(10)
  })

  test('il manifest dice quello che serve per finire in home', async ({ page }) => {
    await page.goto('/')
    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(href).toBeTruthy()

    const manifest = await page.evaluate(async (u) => (await fetch(u!)).json(), href)
    expect(manifest.name).toBe('Veneto — cassa')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBeTruthy()
    // Il fondo dell'app, non più il color carta: installata, la schermata
    // d'avvio partiva bianca in mano a chi lavora al buio.
    expect(manifest.theme_color.toLowerCase()).toBe('#141718')
    expect(manifest.background_color.toLowerCase()).toBe('#141718')

    // Android pretende almeno un'icona da 192 e una maskable per non ritagliare
    // il disegno dentro un cerchio.
    const misure = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(misure).toContain('192x192')
    expect(misure).toContain('512x512')
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  })

  test('le icone esistono davvero e non sono quadrati vuoti', async ({ request, baseURL }) => {
    for (const [file, minimo] of [
      ['/icon-192.png', 400],
      ['/icon-512.png', 800],
    ] as const) {
      const r = await request.get(`${baseURL}${file}`)
      expect(r.status(), `${file} deve esistere`).toBe(200)
      expect(r.headers()['content-type']).toContain('image/png')
      const peso = (await r.body()).length
      // Un quadrato di tinta unita si comprime in poche centinaia di byte:
      // sotto questa soglia significa che il disegno non c'è.
      expect(peso, `${file} sembra vuota (${peso} byte)`).toBeGreaterThan(minimo)
    }
  })

  test('a rete staccata l app si ricarica lo stesso', async ({ page, context }) => {
    // È la prova che il server di sviluppo non può dare, ed è quella che conta:
    // il telefono in tasca, l'app scaricata dalla memoria, e la sagra che
    // continua senza campo.
    await page.goto('/')
    await page.evaluate(() => navigator.serviceWorker.ready)
    // Un secondo giro perché il service worker prenda il controllo della pagina.
    await page.reload()
    await expect(page.locator('#root')).not.toBeEmpty()

    await context.setOffline(true)
    await page.reload()

    // Senza rete non si entra — l'accesso passa da Supabase — ma il guscio
    // dell'app deve comparire lo stesso, invece del dinosauro del browser.
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20_000 })
    expect(await page.title()).toBe('Veneto — cassa')
  })
})
