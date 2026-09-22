import { describe, expect, it } from 'vitest'
import {
  classifica,
  cumulate,
  ordiniRegistrati,
  perFascia,
  perFasciaProdotto,
  riepiloga,
} from '../../src/lib/andamento'
import type { Prodotto, Vendita } from '../../src/lib/tipi'

const P = (id: string, nome: string, tipo: Prodotto['tipo'], prezzo: number, extra: Partial<Prodotto> = {}): Prodotto => ({
  id, edizione_id: 'ed', nome, tipo, prezzo_cent: prezzo, colore: '#B84A10', ordine: 0,
  nascosto: false, pezzi_scelta: null, tipi_scelta: null, ...extra,
})
const PRODOTTI = [
  P('p1', 'Polpette', 'cibo', 200),
  P('p2', 'Alici', 'cibo', 200),
  P('p3', 'Polenta', 'cibo', 200),
  P('b1', 'Aperol', 'bevanda', 500),
  P('o1', '3 cicchetti', 'offerta', 500, { pezzi_scelta: 3, tipi_scelta: ['cibo'] }),
  P('o2', 'Spritz + cicchetto', 'offerta', 500, { pezzi_scelta: 2, tipi_scelta: ['cibo', 'bevanda'] }),
]

let n = 0
const V = (prodotto: string, ora: string, extra: Partial<Vendita> = {}): Vendita => {
  n += 1
  const id = `v${n}`
  return {
    id, prodotto_id: prodotto, quantita: 1, prezzo_cent: PRODOTTI.find((p) => p.id === prodotto)!.prezzo_cent!,
    ordine_id: `ord${n}`, gesto_id: id, dentro_offerta: false,
    operatore_id: 'u', registrato_il: ora, storna_id: null, ...extra,
  }
}

const APERTURA = '2026-09-12T17:05:00.000Z'
const T = (hhmm: string) => `2026-09-12T${hhmm}:00.000Z`

describe('perFascia', () => {
  it('mezz ore dall apertura ad adesso, l ultima in corso', () => {
    const fasce = perFascia([V('b1', T('17:10')), V('b1', T('17:40'))], APERTURA, new Date(T('18:05')))
    expect(fasce.map((f) => f.pezzi)).toEqual([1, 1, 0])
    expect(fasce.at(-1)?.corrente).toBe(true)
    expect(cumulate(fasce)).toEqual([1, 2, 2])
  })
})

describe('perFasciaProdotto', () => {
  it('una serie per prodotto scelto, sulle stesse fasce', () => {
    const righe = [V('b1', T('17:10')), V('p1', T('17:40')), V('p1', T('17:45'))]
    const serie = perFasciaProdotto(righe, ['b1', 'p1'], APERTURA, new Date(T('18:05')))
    expect(serie.get('b1')).toEqual([1, 0, 0])
    expect(serie.get('p1')).toEqual([0, 2, 0])
  })

  it('i componenti scelti contano come pezzi del prodotto', () => {
    const righe = [V('o1', T('17:10'), { gesto_id: 'g' }), V('p1', T('17:10'), { gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 })]
    expect(perFasciaProdotto(righe, ['p1'], APERTURA, new Date(T('17:20'))).get('p1')).toEqual([1])
  })
})

describe('riepiloga', () => {
  it('pezzi netti, incasso netto, ordini distinti; gli storni non sono ordini', () => {
    const v = V('b1', T('17:10'), { ordine_id: 'A' })
    const storno = { ...V('b1', T('17:12'), { ordine_id: 'A' }), quantita: -1, storna_id: v.id }
    const r = riepiloga([v, storno, V('p1', T('17:15'), { ordine_id: 'B' })])
    expect(r).toEqual({ pezzi: 1, incassoCent: 200, ordini: 2 })
  })
})

describe('classifica', () => {
  it('pezzi e incasso per voce, ordinata per pezzi', () => {
    const voci = classifica([V('b1', T('17:10')), V('b1', T('17:11')), V('p1', T('17:12'))], PRODOTTI)
    expect(voci.map((v) => [v.nome, v.pezzi, v.incassoCent])).toEqual([
      ['Aperol', 2, 1000],
      ['Polpette', 1, 200],
    ])
  })

  it('offerta generica: conta come voce, e stima i pezzi dei cibi', () => {
    const voci = classifica([V('o1', T('17:10'))], PRODOTTI)
    expect(voci.find((v) => v.chiave === 'o1')).toMatchObject({ pezzi: 1, incassoCent: 500 })
    expect(voci.find((v) => v.chiave === 'p1')).toMatchObject({ pezzi: 0, stimati: 1 })
    expect(voci.find((v) => v.chiave === 'p3')).toMatchObject({ pezzi: 0, stimati: 1 })
  })

  it('spritz + cicchetto generica: un terzo a cicchetto, bevande non attribuite', () => {
    const voci = classifica([V('o2', T('17:10')), V('o2', T('17:11')), V('o2', T('17:12'))], PRODOTTI)
    expect(voci.find((v) => v.chiave === 'p1')?.stimati).toBe(1)
    expect(voci.find((v) => v.chiave === 'b1')).toBeUndefined()
  })

  it('componenti scelti: pezzi veri, non stima', () => {
    const righe = [
      V('o1', T('17:10'), { gesto_id: 'g' }),
      V('p1', T('17:10'), { gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 }),
      V('p1', T('17:10'), { gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 }),
      V('p2', T('17:10'), { gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 }),
    ]
    const voci = classifica(righe, PRODOTTI)
    expect(voci.find((v) => v.chiave === 'p1')).toMatchObject({ pezzi: 2, stimati: 0, incassoCent: 0 })
    expect(voci.find((v) => v.chiave === 'p3')).toBeUndefined()
  })

  it('lo storno di un offerta generica toglie anche la stima', () => {
    const o = V('o1', T('17:10'))
    const storno = { ...V('o1', T('17:12')), quantita: -1, storna_id: o.id }
    expect(classifica([o, storno], PRODOTTI)).toEqual([])
  })
})

describe('ordiniRegistrati', () => {
  it('raggruppa per ordine, dentro per gesto; lo storno toglie l annullabilità', () => {
    const a1 = V('b1', T('17:10'), { ordine_id: 'A' })
    const a2 = V('o1', T('17:10'), { ordine_id: 'A', gesto_id: 'g' })
    const a3 = V('p1', T('17:10'), { ordine_id: 'A', gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 })
    const storno = { ...V('b1', T('17:12'), { ordine_id: 'A' }), quantita: -1, storna_id: a1.id }
    const [ordine] = ordiniRegistrati([a1, a2, a3, storno], PRODOTTI)
    expect(ordine.ordineId).toBe('A')
    expect(ordine.lordoCent).toBe(1000)
    expect(ordine.nettoCent).toBe(500)
    expect(ordine.gesti).toHaveLength(2)
    const aperol = ordine.gesti.find((g) => g.nome === 'Aperol')!
    expect(aperol.stornato).toBe(true)
    expect(aperol.idAnnullabili).toEqual([])
    const offerta = ordine.gesti.find((g) => g.nome === '3 cicchetti')!
    expect([...offerta.idAnnullabili].sort()).toEqual([a2.id, a3.id].sort())
    expect(offerta.dettaglio).toBe('Polpette')
  })
})

describe('componenti e storni di gesti interi', () => {
  it('riepiloga e perFascia: i componenti a zero non sono pezzi in più', () => {
    const righe = [
      V('o1', T('17:10'), { ordine_id: 'A', gesto_id: 'g' }),
      V('p1', T('17:10'), { ordine_id: 'A', gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 }),
      V('p2', T('17:10'), { ordine_id: 'A', gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 }),
      V('p3', T('17:10'), { ordine_id: 'A', gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 }),
    ]
    expect(riepiloga(righe)).toEqual({ pezzi: 1, incassoCent: 500, ordini: 1 })
    const [f] = perFascia(righe, APERTURA, new Date(T('17:20')))
    expect(f).toMatchObject({ pezzi: 1, incassoCent: 500 })
  })

  it('storno di un offerta con componenti: niente stima, gesto non più annullabile', () => {
    const o = V('o1', T('17:10'), { ordine_id: 'A', gesto_id: 'g' })
    const c1 = V('p1', T('17:10'), { ordine_id: 'A', gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 })
    const c2 = V('p2', T('17:10'), { ordine_id: 'A', gesto_id: 'g', dentro_offerta: true, prezzo_cent: 0 })
    const storni = [o, c1, c2].map((r) => {
      const s = V(r.prodotto_id, T('17:12'), { ordine_id: 'A', dentro_offerta: r.dentro_offerta, prezzo_cent: r.prezzo_cent })
      return { ...s, quantita: -1, storna_id: r.id }
    })
    const righe = [o, c1, c2, ...storni]
    expect(classifica(righe, PRODOTTI)).toEqual([])
    const [ordine] = ordiniRegistrati(righe, PRODOTTI)
    expect(ordine.gesti).toHaveLength(1)
    expect(ordine.gesti[0]).toMatchObject({ stornato: true, idAnnullabili: [] })
    expect(ordine.nettoCent).toBe(0)
    expect(ordine.lordoCent).toBe(500)
  })

  it('l ora dell ordine è la più antica, qualunque sia l ordine delle righe', () => {
    const tardi = V('b1', T('17:20'), { ordine_id: 'A' })
    const presto = V('p1', T('17:10'), { ordine_id: 'A' })
    expect(ordiniRegistrati([tardi, presto], PRODOTTI)[0].ora).toBe(T('17:10'))
    expect(ordiniRegistrati([presto, tardi], PRODOTTI)[0].ora).toBe(T('17:10'))
  })
})
