import { describe, it, expect } from 'vitest'
import { inFila, nuovoOrdine } from '../../src/features/listino/albero'

/** Applica quello che `nuovoOrdine` chiede e rimette in fila come fa il database. */
function dopoLoSpostamento(
  righe: { id: string; ordine: number }[],
  indice: number,
  verso: -1 | 1,
) {
  const cambiate = new Map(nuovoOrdine(righe, indice, verso).map((r) => [r.id, r.ordine]))
  return righe
    .map((r) => ({ ...r, ordine: cambiate.get(r.id) ?? r.ordine }))
    .sort((a, b) => a.ordine - b.ordine)
    .map((r) => r.id)
}

describe('nuovoOrdine', () => {
  it('non chiede niente ai bordi', () => {
    const righe = [
      { id: 'a', ordine: 1 },
      { id: 'b', ordine: 2 },
    ]
    expect(nuovoOrdine(righe, 0, -1)).toEqual([])
    expect(nuovoOrdine(righe, 1, 1)).toEqual([])
  })

  it('scambia due righe già numerate toccandone due sole', () => {
    const righe = [
      { id: 'a', ordine: 1 },
      { id: 'b', ordine: 2 },
      { id: 'c', ordine: 3 },
    ]
    expect(nuovoOrdine(righe, 2, -1)).toHaveLength(2)
    expect(dopoLoSpostamento(righe, 2, -1)).toEqual(['a', 'c', 'b'])
  })

  it('muove di UN posto anche quando ordine è tutto a zero', () => {
    // È il caso normale: `ordine` ha default 0 e nessuno l'ha mai toccato.
    // Uno scambio fra due zeri non muoverebbe niente, e un valore fuori scala
    // su una sola riga la porterebbe in cima invece che di un posto.
    const righe = [
      { id: 'a', ordine: 0 },
      { id: 'b', ordine: 0 },
      { id: 'c', ordine: 0 },
    ]
    expect(dopoLoSpostamento(righe, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(dopoLoSpostamento(righe, 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('la prima volta riscrive tutto il livello, poi solo due righe', () => {
    const pariMerito = [
      { id: 'a', ordine: 0 },
      { id: 'b', ordine: 0 },
      { id: 'c', ordine: 0 },
    ]
    expect(nuovoOrdine(pariMerito, 0, 1)).toHaveLength(3)

    const numerate = [
      { id: 'a', ordine: 1 },
      { id: 'b', ordine: 2 },
      { id: 'c', ordine: 3 },
    ]
    expect(nuovoOrdine(numerate, 0, 1)).toHaveLength(2)
  })

  it('portare giù e poi su riporta al punto di partenza', () => {
    const righe = [
      { id: 'a', ordine: 0 },
      { id: 'b', ordine: 0 },
      { id: 'c', ordine: 0 },
    ]
    const cambiate = new Map(nuovoOrdine(righe, 0, 1).map((r) => [r.id, r.ordine]))
    const intermedio = righe
      .map((r) => ({ ...r, ordine: cambiate.get(r.id) ?? r.ordine }))
      .sort((a, b) => a.ordine - b.ordine)
    expect(intermedio.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(dopoLoSpostamento(intermedio, 1, -1)).toEqual(['a', 'b', 'c'])
  })

  it('non modifica l elenco che riceve', () => {
    const righe = [
      { id: 'a', ordine: 0 },
      { id: 'b', ordine: 0 },
    ]
    nuovoOrdine(righe, 0, 1)
    expect(righe).toEqual([
      { id: 'a', ordine: 0 },
      { id: 'b', ordine: 0 },
    ])
  })
})

describe('inFila', () => {
  it('ordina per ordine, non per come sono arrivate', () => {
    const righe = [
      { id: 'b', nome: 'Cicchetti', ordine: 2 },
      { id: 'a', nome: 'Spritz', ordine: 1 },
    ]
    expect(inFila(righe).map((r) => r.nome)).toEqual(['Spritz', 'Cicchetti'])
  })

  it('a parità di ordine mette in fila per nome, con le regole italiane', () => {
    // Tutte a zero è il caso normale: `ordine` ha default 0 e chi configura
    // non lo tocca finché non gli serve. Senza il ripiego sul nome l'elenco
    // cambierebbe posizione a ogni ricarica.
    const righe = [
      { id: 'c', nome: 'Zabaione', ordine: 0 },
      { id: 'a', nome: 'Àcqua', ordine: 0 },
      { id: 'b', nome: 'Birra', ordine: 0 },
    ]
    expect(inFila(righe).map((r) => r.nome)).toEqual(['Àcqua', 'Birra', 'Zabaione'])
  })

  it('non modifica quello che riceve', () => {
    const righe = [
      { id: 'b', nome: 'B', ordine: 2 },
      { id: 'a', nome: 'A', ordine: 1 },
    ]
    inFila(righe)
    expect(righe.map((r) => r.id)).toEqual(['b', 'a'])
  })
})
