import { describe, it, expect } from 'vitest'
import { scegliCorrente } from '../../src/dati/sagra'
import type { Edizione } from '../../src/lib/tipi'

function ed(anno: number, stato: Edizione['stato']): Edizione {
  return { id: `id-${anno}`, anno, nome: `Sagra ${anno}`, stato, aperta_il: null, chiusa_il: null }
}

describe('scegliCorrente', () => {
  it('senza edizioni non sceglie niente', () => {
    expect(scegliCorrente([])).toBeNull()
  })

  it('l aperta batte tutto', () => {
    // Durante la serata non c'è dubbio possibile: si lavora su quella aperta,
    // anche se il capo stand ha già abbozzato l'anno prossimo.
    const scelta = scegliCorrente([ed(2027, 'bozza'), ed(2026, 'aperta'), ed(2025, 'chiusa')])
    expect(scelta?.anno).toBe(2026)
  })

  it('senza aperta prende la bozza più recente', () => {
    // È il caso dei giorni prima della sagra: si sta configurando.
    const scelta = scegliCorrente([ed(2025, 'chiusa'), ed(2026, 'bozza'), ed(2024, 'bozza')])
    expect(scelta?.anno).toBe(2026)
  })

  it('con sole edizioni chiuse prende la più recente', () => {
    // Il giorno dopo la sagra: si guarda lo storico, non si configura niente.
    const scelta = scegliCorrente([ed(2024, 'chiusa'), ed(2026, 'chiusa'), ed(2025, 'chiusa')])
    expect(scelta?.anno).toBe(2026)
  })

  it('non modifica l elenco che riceve', () => {
    // L'elenco arriva dallo stato di React: ordinarlo sul posto sarebbe una
    // mutazione dello stato, e React non se ne accorgerebbe.
    const elenco = [ed(2024, 'chiusa'), ed(2026, 'chiusa')]
    scegliCorrente(elenco)
    expect(elenco.map((e) => e.anno)).toEqual([2024, 2026])
  })
})
