import { describe, it, expect } from 'vitest'
import {
  componiCsv,
  nomeFile,
  INTESTAZIONI,
  type RigaEsportabile,
} from '../../src/features/sessione/esportazione'

const riga = (extra: Partial<RigaEsportabile> = {}): RigaEsportabile => ({
  registrato_il: new Date(2026, 7, 9, 21, 14, 3).toISOString(),
  tipo: 'bevanda',
  prodotto: 'Aperol',
  quantita: 1,
  prezzo_cent: 600,
  operatore: 'Riccardo Filosi',
  ordine: 'o1',
  gesto: 'g1',
  dentro_offerta: false,
  storno: false,
  ...extra,
})

const colonne = (csv: string, i: number) => csv.split('\r\n')[i].split(';')

/**
 * La colonna per NOME, non per posizione. Legarsi all'indice significa che
 * aggiungere una colonna in mezzo rompe otto asserzioni che non c'entrano — ed
 * è esattamente cio' che è successo quando `ordine` si è infilato prima di
 * `gesto`.
 */
const col = (csv: string, nome: (typeof INTESTAZIONI)[number], riga = 1) =>
  colonne(csv, riga)[INTESTAZIONI.indexOf(nome)]

describe('componiCsv', () => {
  it('apre con le intestazioni', () => {
    expect(componiCsv([]).split('\r\n')[0]).toBe(INTESTAZIONI.join(';'))
  })

  it('scrive una riga per movimento, senza aggregare', () => {
    const csv = componiCsv([riga(), riga({ prodotto: 'Campari' })])
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('porta tipo e voce, che sono le colonne delle pivot', () => {
    const csv = componiCsv([riga()])
    expect(col(csv, 'tipo')).toBe('bevanda')
    expect(col(csv, 'voce')).toBe('Aperol')
  })

  it('mette gli importi con la virgola', () => {
    // Excel in italiano vuole la virgola decimale. Con il punto leggerebbe
    // 6.00 come seimila in certe impostazioni, e i totali sarebbero assurdi.
    const csv = componiCsv([riga({ prezzo_cent: 600, quantita: 2 })])
    expect(col(csv, 'prezzo')).toBe('6,00')
    expect(col(csv, 'importo')).toBe('12,00')
  })

  it('sui centesimi non arrotonda niente', () => {
    expect(col(componiCsv([riga({ prezzo_cent: 283 })]), 'prezzo')).toBe('2,83')
  })

  it('lo storno porta il segno meno sull importo', () => {
    const csv = componiCsv([riga({ quantita: -1, storno: true })])
    expect(col(csv, 'quantita')).toBe('-1')
    expect(col(csv, 'importo')).toBe('-6,00')
    expect(col(csv, 'storno')).toBe('si')
  })

  it('porta l ordine accanto al gesto: sono due raggruppamenti diversi', () => {
    // `gesto` lega le righe di UN GESTO — le tre di un'offerta. `ordine` lega
    // quelle di UN CLIENTE. Senza la seconda, in una pivot non si contano gli
    // scontrini ne' si ricostruisce cosa ha preso ciascuno.
    const csv = componiCsv([riga({ ordine: 'ordine-7', gesto: 'gesto-3', dentro_offerta: true })])
    expect(col(csv, 'ordine')).toBe('ordine-7')
    expect(col(csv, 'gesto')).toBe('gesto-3')
    expect(col(csv, 'dentro_offerta')).toBe('si')
  })

  it('un nome col punto e virgola non spacca la riga', () => {
    // Il separatore dentro un campo è il modo classico di rompere un CSV: la
    // riga si allarga di una colonna e da lì in poi tutto è sfalsato.
    const csv = componiCsv([riga({ prodotto: 'Spritz; secco' })])
    expect(csv.split('\r\n')[1].split(';')).toHaveLength(INTESTAZIONI.length + 1)
    expect(csv).toContain('"Spritz; secco"')
  })

  it('le virgolette dentro un nome si raddoppiano', () => {
    const csv = componiCsv([riga({ prodotto: 'Spritz "della casa"' })])
    expect(csv).toContain('"Spritz ""della casa"""')
  })

  it('un a capo dentro un nome resta dentro il campo', () => {
    const csv = componiCsv([riga({ prodotto: 'Spritz\nlungo' })])
    expect(csv).toContain('"Spritz\nlungo"')
  })

  it('scrive l ora in un formato che si ordina da solo', () => {
    expect(col(componiCsv([riga()]), 'ora')).toBe('2026-08-09 21:14:03')
  })

  it('chiude le righe come le vuole Excel su Windows', () => {
    expect(componiCsv([riga()])).toContain('\r\n')
  })
})

describe('nomeFile', () => {
  it('mette insieme nome e anno', () => {
    expect(nomeFile('Sagra 2026', 2026)).toBe('sagra-2026-2026.csv')
  })

  it('toglie quello che un filesystem non gradisce', () => {
    expect(nomeFile('Stand Veneto / prova!', 2027)).toBe('stand-veneto-prova-2027.csv')
  })

  it('un nome vuoto non produce un file senza nome', () => {
    expect(nomeFile('   ', 2026)).toBe('edizione-2026.csv')
  })
})
