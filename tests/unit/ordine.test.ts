import { describe, expect, it } from 'vitest'
import {
  aggiungi,
  aggiungiOfferta,
  nuovoId,
  perIlServer,
  quantiDi,
  raggruppa,
  togliGesto,
  togliUno,
  totaleCent,
  type Pezzo,
} from '../../src/lib/ordine'
import type { Prodotto } from '../../src/lib/tipi'

const ORA = '2026-09-12T21:04:12.345Z'

const prodotto = (id: string, nome: string, prezzo: number, tipo: Prodotto['tipo'] = 'cibo'): Prodotto => ({
  id, edizione_id: 'ed', nome, tipo, prezzo_cent: prezzo, colore: '#B84A10', ordine: 0,
  nascosto: false, pezzi_scelta: null, tipi_scelta: null,
})
const offerta = (id: string, nome: string, prezzo: number, pezzi: number, tipi: Prodotto['tipo'][]): Prodotto => ({
  ...prodotto(id, nome, prezzo, 'offerta'), pezzi_scelta: pezzi, tipi_scelta: tipi,
})

const polpette = prodotto('p1', 'Polpette', 200)
const alici = prodotto('p2', 'Alici', 200)
const aperol = prodotto('b1', 'Aperol', 500, 'bevanda')
const tre = offerta('o1', '3 cicchetti', 500, 3, ['cibo'])

const batti = (...p: Prodotto[]): Pezzo[] => p.reduce<Pezzo[]>((acc, x) => aggiungi(acc, x, ORA), [])

describe('battere e correggere', () => {
  it('quattro tocchi sono quattro pezzi, e il totale li segue', () => {
    const pezzi = batti(aperol, aperol, aperol, aperol)
    expect(pezzi).toHaveLength(4)
    expect(totaleCent(pezzi)).toBe(2000)
    expect(quantiDi(pezzi, 'b1')).toBe(4)
  })

  it('uno in meno toglie l ultimo pezzo libero di quel prodotto', () => {
    const pezzi = togliUno(batti(aperol, polpette, aperol), 'b1')
    expect(pezzi.map((p) => p.prodottoId)).toEqual(['b1', 'p1'])
  })

  it('ogni pezzo libero fa gesto da solo', () => {
    const [a, b] = batti(aperol, aperol)
    expect(a.gestoId).not.toBe(b.gestoId)
    expect(a.gestoId).toBe(a.id)
  })
})

describe('offerte a scelta', () => {
  it('con i componenti: una riga a prezzo pieno più N a zero, stesso gesto', () => {
    const pezzi = aggiungiOfferta([], tre, [polpette, alici, polpette], ORA)
    expect(pezzi).toHaveLength(4)
    expect(pezzi[0]).toMatchObject({ prodottoId: 'o1', prezzoCent: 500, offerta: true, dentroOfferta: false })
    expect(pezzi.slice(1).every((p) => p.prezzoCent === 0 && p.dentroOfferta && !p.offerta)).toBe(true)
    expect(new Set(pezzi.map((p) => p.gestoId)).size).toBe(1)
    expect(totaleCent(pezzi)).toBe(500)
  })

  it('generica: solo la riga dell offerta', () => {
    const pezzi = aggiungiOfferta([], tre, [], ORA)
    expect(pezzi).toHaveLength(1)
    expect(pezzi[0]).toMatchObject({ offerta: true, dentroOfferta: false })
  })

  it('uno in meno non tocca né componenti né offerte', () => {
    const conOfferta = aggiungiOfferta([], tre, [polpette, alici, polpette], ORA)
    expect(togliUno(conOfferta, 'p1')).toHaveLength(4)
    expect(togliUno(conOfferta, 'o1')).toHaveLength(4)
  })

  it('togliere il gesto porta via offerta e componenti', () => {
    const conOfferta = aggiungiOfferta(batti(aperol), tre, [polpette, alici, polpette], ORA)
    const pezzi = togliGesto(conOfferta, conOfferta[1].gestoId)
    expect(pezzi.map((p) => p.prodottoId)).toEqual(['b1'])
  })

  it('stesso prodotto libero e dentro un offerta: il badge conta il libero, uno in meno toglie solo quello', () => {
    const pezzi = aggiungiOfferta(batti(polpette), tre, [polpette], ORA)
    expect(quantiDi(pezzi, 'p1')).toBe(1)
    const dopo = togliUno(pezzi, 'p1')
    expect(dopo).toHaveLength(2)
    expect(dopo.some((p) => p.dentroOfferta && p.prodottoId === 'p1')).toBe(true)
    const blocchi = raggruppa(pezzi)
    expect(blocchi[0]).toMatchObject({ tipo: 'prodotto', quantita: 1 })
    expect(blocchi[1]).toMatchObject({ tipo: 'offerta', componenti: ['Polpette'] })
  })
})

describe('raggruppa', () => {
  it('prodotti per voce con quantità, offerte come blocco con i nomi dei componenti', () => {
    const pezzi = aggiungiOfferta(batti(aperol, aperol, polpette), tre, [polpette, alici, polpette], ORA)
    const blocchi = raggruppa(pezzi)
    expect(blocchi.map((b) => b.tipo)).toEqual(['prodotto', 'prodotto', 'offerta'])
    expect(blocchi[0]).toMatchObject({ nome: 'Aperol', quantita: 2, totaleCent: 1000 })
    expect(blocchi[2]).toMatchObject({ nome: '3 cicchetti', totaleCent: 500, componenti: ['Polpette', 'Alici', 'Polpette'] })
  })

  it('un offerta generica è un blocco offerta senza componenti', () => {
    const blocchi = raggruppa(aggiungiOfferta([], tre, [], ORA))
    expect(blocchi[0]).toMatchObject({ tipo: 'offerta', componenti: [] })
  })
})

describe('perIlServer', () => {
  it('manda id, prodotto, gesto, ordine, dentro_offerta, ora — mai il prezzo', () => {
    const pezzi = aggiungiOfferta([], tre, [polpette], ORA)
    const righe = perIlServer(pezzi, 'ord')
    expect(righe[0]).toEqual({
      id: pezzi[0].id, prodotto_id: 'o1', quantita: 1, gesto_id: pezzi[0].gestoId,
      ordine_id: 'ord', dentro_offerta: false, registrato_il: ORA,
    })
    expect(righe[1].dentro_offerta).toBe(true)
    expect('prezzo_cent' in righe[0]).toBe(false)
  })
})

describe('nuovoId', () => {
  it('è un uuid v4', () => {
    expect(nuovoId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
