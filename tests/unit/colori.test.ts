import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { TINTE, inchiostroPerSmalto, eTintaValida } from '../../src/lib/colori'

/** La stessa luminanza WCAG di inchiostroPerSmalto, ricalcolata qui: serve a
    misurare il margine dalla soglia, che la funzione non espone. */
function luminanza(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const canali = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * canali[0] + 0.7152 * canali[1] + 0.0722 * canali[2]
}

/** Le sette storiche: i prodotti in archivio le citano, non si toccano. */
const STORICHE = ['#B84A10', '#0B63A8', '#D9A020', '#4A4FB5', '#8A6A0E', '#4FA0DC', '#A02B57']

describe('TINTE', () => {
  it('sono venti', () => {
    expect(TINTE).toHaveLength(20)
  })

  it('sono tutte esadecimali maiuscoli a sei cifre', () => {
    for (const tinta of TINTE) {
      expect(tinta.hex).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('non contiene due volte la stessa tinta, ne lo stesso nome', () => {
    const hex = TINTE.map((t) => t.hex)
    expect(new Set(hex).size).toBe(hex.length)
    const nomi = TINTE.map((t) => t.nome)
    expect(new Set(nomi).size).toBe(nomi.length)
  })

  it('le prime sette sono le storiche, identiche all esadecimale', () => {
    // Il backfill della 022 ha copiato queste sette sui prodotti esistenti:
    // cambiarle qui slegherebbe il ventaglio dai colori gia in archivio.
    expect(TINTE.slice(0, 7).map((t) => t.hex)).toEqual(STORICHE)
  })

  it('rispetta il formato che pretende il database (022)', () => {
    // Il CHECK e' di formato, non un elenco: basta che ogni tinta lo passi.
    const sql = readFileSync('supabase/migrations/022_listino_insiemi.sql', 'utf8')
    const vincolo = sql.match(/check \(colore ~ '([^']+)'\)/)
    expect(vincolo, 'CHECK di formato su prodotti.colore non trovato in 022').not.toBeNull()
    const regola = new RegExp(vincolo![1])
    for (const tinta of TINTE) {
      expect(tinta.hex).toMatch(regola)
    }
  })

  it('le tinte nuove stanno lontane dalla soglia dell inchiostro', () => {
    // inchiostroPerSmalto decide a 0,18 di luminanza: una tinta a ridosso
    // della soglia avrebbe l'inchiostro giusto per un soffio, e basterebbe
    // uno schermo scadente a renderla illeggibile. Le nuove devono stare
    // sotto 0,13 o sopra 0,24; le storiche sono esenti (bruno oro e' a 0,16
    // da sempre, e i prodotti in archivio lo portano addosso).
    for (const tinta of TINTE.slice(7)) {
      const l = luminanza(tinta.hex)
      expect(l < 0.13 || l > 0.24, `${tinta.nome} ${tinta.hex} luminanza ${l.toFixed(3)}`).toBe(
        true,
      )
    }
  })
})

describe('eTintaValida', () => {
  it('riconosce una tinta del ventaglio', () => {
    expect(eTintaValida('#B84A10')).toBe(true)
  })

  it('rifiuta una tinta fuori ventaglio', () => {
    // Il vincolo vero sta sul database. Questo serve all'interfaccia per non
    // proporre nemmeno di provarci.
    expect(eTintaValida('#0E6E6B')).toBe(false)
  })

  it('non si lascia ingannare dalle minuscole', () => {
    expect(eTintaValida('#b84a10')).toBe(true)
  })
})

describe('inchiostroPerSmalto', () => {
  it('scrive scuro sull ocra', () => {
    expect(inchiostroPerSmalto('#D9A020')).toBe('var(--smalto-scuro)')
  })

  it('scrive scuro sull azzurro', () => {
    expect(inchiostroPerSmalto('#4FA0DC')).toBe('var(--smalto-scuro)')
  })

  it('scrive chiaro sulle altre cinque', () => {
    for (const hex of ['#B84A10', '#0B63A8', '#4A4FB5', '#8A6A0E', '#A02B57']) {
      expect(inchiostroPerSmalto(hex)).toBe('var(--smalto-chiaro)')
    }
  })

  it('ripiega sul chiaro davanti a un valore malformato', () => {
    // Un colore arrivato storto dal database non deve rendere illeggibile
    // un bottone: meglio un contrasto imperfetto che testo invisibile.
    expect(inchiostroPerSmalto('rosso')).toBe('var(--smalto-chiaro)')
    expect(inchiostroPerSmalto(null)).toBe('var(--smalto-chiaro)')
  })
})
