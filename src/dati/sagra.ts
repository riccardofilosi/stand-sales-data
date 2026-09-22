import type { Edizione } from '../lib/tipi'

/**
 * Su quale edizione lavora l'app adesso: l'aperta vince; senza, la bozza più
 * recente (i giorni prima); senza nemmeno quella, l'ultima chiusa (storico).
 */
export function scegliCorrente(edizioni: Edizione[]): Edizione | null {
  const perAnnoDecrescente = (a: Edizione, b: Edizione) => b.anno - a.anno
  const recente = (stato: Edizione['stato']) =>
    edizioni.filter((e) => e.stato === stato).sort(perAnnoDecrescente)[0]
  return recente('aperta') ?? recente('bozza') ?? recente('chiusa') ?? null
}
