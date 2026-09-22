import { test, expect, type Page } from '@playwright/test'

/**
 * La cassa dal telefono, contro il database vero.
 *
 * Il pezzo che conta è l'ultimo: rete staccata a metà raffica. La coda offline
 * è l'unica parte che può far fallire la serata — alla sagra la copertura salta
 * proprio nell'ora di punta — e finora aveva solo prove unitarie, dove la rete
 * è finta e il browser non esiste.
 */

const CHIAVE_CODA = 'veneto.coda'

async function entra(page: Page) {
  const email = process.env.TEST_OPERATORE_EMAIL
  const password = process.env.TEST_OPERATORE_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Mancano TEST_OPERATORE_EMAIL e TEST_OPERATORE_PASSWORD in .env.test.local',
    )
  }

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Entra' }).click()

  // Dopo il login si atterra sull'hub (design 16/08): la cassa e' la targa
  // grande, un tocco. Se poi compare il totale, siamo dentro.
  await page.getByRole('button', { name: 'Cassa' }).click({ timeout: 20_000 })
  await expect(page.getByRole('status')).toBeVisible({ timeout: 20_000 })
}

/** Il totale in alto, in centesimi, letto da com'è scritto sullo schermo. */
async function totaleCent(page: Page): Promise<number> {
  const testo = (await page.getByRole('status').innerText()).trim()
  const pulito = testo.replace(/[^\d,]/g, '').replace(',', '.')
  return Math.round(Number(pulito) * 100)
}

/** La prima targa disponibile, che è anche quella che la mano trova per prima. */
function primaTarga(page: Page) {
  return page.locator('button.targa').first()
}

async function bustePendenti(page: Page): Promise<number> {
  return page.evaluate((chiave) => {
    const grezzo = localStorage.getItem(chiave)
    if (!grezzo) return 0
    try {
      return (JSON.parse(grezzo).attesa ?? []).length
    } catch {
      return 0
    }
  }, CHIAVE_CODA)
}

test.beforeEach(async ({ page }) => {
  await entra(page)
  // Una coda ereditata da una prova precedente falserebbe ogni conteggio.
  await page.evaluate((chiave) => localStorage.removeItem(chiave), CHIAVE_CODA)
})

test('battere quattro e correggere a tre, prima di registrare', async ({ page }) => {
  // È la correzione che capita davvero: il cliente ne aveva chiesti tre, e il
  // totale è già salito abbastanza da farsene accorgere.
  const targa = primaTarga(page)
  const nome = (await targa.locator('span').first().innerText()).trim()

  for (let i = 0; i < 4; i++) await targa.click()

  await expect(targa.locator('.contatore')).toHaveText('4')
  const quattro = await totaleCent(page)
  expect(quattro).toBeGreaterThan(0)

  await page.getByRole('button', { name: `Uno in meno di ${nome}` }).click()

  await expect(targa.locator('.contatore')).toHaveText('3')
  expect(await totaleCent(page)).toBe(Math.round((quattro / 4) * 3))
})

test('una raffica non perde pezzi per strada', async ({ page }) => {
  // Venti tocchi senza respiro: è l'ora di punta, e il conto deve tornare.
  const targa = primaTarga(page)
  for (let i = 0; i < 20; i++) await targa.click()

  await expect(targa.locator('.contatore')).toHaveText('20')
  const venti = await totaleCent(page)
  await targa.click()
  expect(await totaleCent(page)).toBe(Math.round((venti / 20) * 21))
})

test('un offerta a scelta: griglia filtrata, conferma, riga nella distinta', async ({ page }) => {
  const offerta = page.locator('section[aria-label="Offerte"] button.targa').first()
  await offerta.click()
  const scelta = page.getByRole('region', { name: /^Scegli per/ })
  await expect(scelta).toBeVisible()
  const targhe = scelta.locator('button.targa')
  const quanti = Number((await scelta.locator('.num.tenue').innerText()).split('/')[1])
  for (let i = 0; i < quanti; i++) await targhe.first().click()
  await scelta.getByRole('button', { name: 'Conferma' }).click()
  await expect(page.getByRole('region', { name: 'Ordine in corso' })).toContainText('·')
})

test('rete staccata a metà raffica: niente si perde, niente si duplica', async ({
  page,
  context,
}) => {
  const targa = primaTarga(page)

  // --- Primo ordine con la rete ------------------------------------------
  await targa.click()
  await page.getByRole('button', { name: /Registra ordine/ }).click()
  await expect(page.getByRole('status')).toHaveText(/0,00/)
  await expect.poll(() => bustePendenti(page), { timeout: 20_000 }).toBe(0)

  // --- Cade la linea ------------------------------------------------------
  await context.setOffline(true)

  for (let ordine = 0; ordine < 3; ordine++) {
    await targa.click()
    await targa.click()
    await page.getByRole('button', { name: /Registra ordine/ }).click()
    await expect(page.getByRole('status')).toHaveText(/0,00/)
  }

  // La cassa non si è fermata: le buste sono sul telefono e aspettano.
  await expect.poll(() => bustePendenti(page), { timeout: 20_000 }).toBe(3)

  // Sono su disco, non in memoria: è questo che le fa sopravvivere all'app
  // scaricata dalla memoria mentre il telefono sta in tasca. Ricaricare la
  // pagina QUI non si può — in sviluppo non c'è service worker e il browser
  // non ha da dove ripescare l'app — ma il deposito è già quello definitivo.
  const suDisco = await page.evaluate(
    (chiave) => JSON.parse(localStorage.getItem(chiave) ?? '{}').attesa?.length ?? 0,
    CHIAVE_CODA,
  )
  expect(suDisco).toBe(3)

  // --- Torna la linea -----------------------------------------------------
  await context.setOffline(false)
  await expect.poll(() => bustePendenti(page), { timeout: 40_000 }).toBe(0)

  // Ricaricare adesso deve trovare la coda vuota: se una busta ripartisse, il
  // database la scarterebbe per la chiave primaria, ma la coda non deve
  // nemmeno provarci.
  await page.reload()
  await expect(page.getByRole('status')).toBeVisible({ timeout: 20_000 })
  expect(await bustePendenti(page)).toBe(0)
})
