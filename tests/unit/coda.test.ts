import { describe, it, expect, vi } from 'vitest'
import {
  creaCoda,
  prossimoRitardoMs,
  ErrorePermanente,
  type Coda,
} from '../../src/lib/coda'

/** Storage finto: i test non devono dipendere da quello di jsdom, condiviso. */
function memoriaFinta(): Storage {
  const dati = new Map<string, string>()
  return {
    get length() { return dati.size },
    clear: () => dati.clear(),
    getItem: (k) => dati.get(k) ?? null,
    key: (i) => [...dati.keys()][i] ?? null,
    removeItem: (k) => { dati.delete(k) },
    setItem: (k, v) => { dati.set(k, v) },
  } as Storage
}

function coda(
  invia: (rpc: string, payload: unknown) => Promise<void>,
  memoria: Storage = memoriaFinta()
): { c: Coda; memoria: Storage } {
  return { c: creaCoda({ invia, memoria }), memoria }
}

describe('accodare', () => {
  it('mette la busta in attesa', () => {
    const { c } = coda(async () => {})
    c.accoda('b1', 'registra_vendite', { x: 1 })
    expect(c.inAttesa()).toBe(1)
  })

  it('non accoda due volte la stessa busta', () => {
    // Un doppio tocco sul bottone, o un componente React che si rimonta,
    // non devono raddoppiare una vendita.
    const { c } = coda(async () => {})
    c.accoda('b1', 'registra_vendite', { x: 1 })
    c.accoda('b1', 'registra_vendite', { x: 1 })
    expect(c.inAttesa()).toBe(1)
  })
})

describe('svuotare', () => {
  it('manda le buste e le toglie dalla coda', async () => {
    const inviate: string[] = []
    const { c } = coda(async (rpc) => { inviate.push(rpc) })
    c.accoda('b1', 'registra_vendite', { x: 1 })
    await c.svuota()
    expect(inviate).toEqual(['registra_vendite'])
    expect(c.inAttesa()).toBe(0)
  })

  it('rispetta l ordine in cui sono state accodate', async () => {
    const inviate: unknown[] = []
    const { c } = coda(async (_rpc, payload) => { inviate.push(payload) })
    c.accoda('b1', 'registra_vendite', { n: 1 })
    c.accoda('b2', 'registra_vendite', { n: 2 })
    c.accoda('b3', 'registra_vendite', { n: 3 })
    await c.svuota()
    expect(inviate).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('tiene in coda la busta caduta per rete e conta il tentativo', async () => {
    const { c } = coda(async () => { throw new Error('network') })
    c.accoda('b1', 'registra_vendite', { x: 1 })
    await c.svuota()
    expect(c.inAttesa()).toBe(1)
    expect(c.buste()[0].tentativi).toBe(1)
  })

  it('si ferma alla prima caduta di rete, per non perdere l ordine', async () => {
    // Se la rete e' giu' per la prima busta lo e' anche per le altre: insistere
    // brucia batteria e rischia di far arrivare la seconda prima della prima.
    const inviate: unknown[] = []
    const { c } = coda(async (_rpc, payload) => {
      inviate.push(payload)
      throw new Error('network')
    })
    c.accoda('b1', 'registra_vendite', { n: 1 })
    c.accoda('b2', 'registra_vendite', { n: 2 })
    await c.svuota()
    expect(inviate).toEqual([{ n: 1 }])
    expect(c.inAttesa()).toBe(2)
  })

  it('mette da parte la busta rifiutata dal server e prosegue', async () => {
    // Una busta che il server rifiuta (sessione chiusa, offerta incompleta)
    // non guarira' mai da sola: ritentarla in eterno bloccherebbe tutte le
    // altre dietro di lei.
    const inviate: unknown[] = []
    const { c } = coda(async (_rpc, payload) => {
      inviate.push(payload)
      if ((payload as { n: number }).n === 1) {
        throw new ErrorePermanente('offerta incompleta')
      }
    })
    c.accoda('b1', 'registra_vendite', { n: 1 })
    c.accoda('b2', 'registra_vendite', { n: 2 })
    await c.svuota()
    expect(inviate).toEqual([{ n: 1 }, { n: 2 }])
    expect(c.inAttesa()).toBe(0)
    expect(c.respinte()).toHaveLength(1)
    expect(c.respinte()[0].errore).toBe('offerta incompleta')
  })

  it('non manda due volte la stessa busta se svuota parte due volte', async () => {
    let inFlight = 0
    let massimo = 0
    const { c } = coda(async () => {
      inFlight++
      massimo = Math.max(massimo, inFlight)
      await Promise.resolve()
      inFlight--
    })
    c.accoda('b1', 'registra_vendite', { n: 1 })
    await Promise.all([c.svuota(), c.svuota()])
    expect(massimo).toBe(1)
    expect(c.inAttesa()).toBe(0)
  })
})

describe('persistenza', () => {
  it('ritrova le buste dopo un riavvio', () => {
    // La sagra e' un giorno all'anno: un telefono che si riavvia non deve
    // portarsi via mezz'ora di vendite.
    const memoria = memoriaFinta()
    const prima = creaCoda({ invia: async () => {}, memoria })
    prima.accoda('b1', 'registra_vendite', { n: 1 })

    const dopo = creaCoda({ invia: async () => {}, memoria })
    expect(dopo.inAttesa()).toBe(1)
    expect(dopo.buste()[0].payload).toEqual({ n: 1 })
  })

  it('riparte da zero se la memoria contiene spazzatura', () => {
    const memoria = memoriaFinta()
    memoria.setItem('veneto.coda', 'non è json')
    const c = creaCoda({ invia: async () => {}, memoria })
    expect(c.inAttesa()).toBe(0)
  })
})

describe('sottoscrivi', () => {
  it('avvisa quando la coda cambia', async () => {
    const ascoltatore = vi.fn()
    const { c } = coda(async () => {})
    const disdici = c.sottoscrivi(ascoltatore)
    c.accoda('b1', 'registra_vendite', { n: 1 })
    expect(ascoltatore).toHaveBeenCalled()
    disdici()
    ascoltatore.mockClear()
    c.accoda('b2', 'registra_vendite', { n: 2 })
    expect(ascoltatore).not.toHaveBeenCalled()
  })
})

describe('prossimoRitardoMs', () => {
  it('cresce a ogni tentativo', () => {
    expect(prossimoRitardoMs(0)).toBeLessThan(prossimoRitardoMs(1))
    expect(prossimoRitardoMs(1)).toBeLessThan(prossimoRitardoMs(2))
  })

  it('non supera il minuto', () => {
    // Oltre il minuto la coda smetterebbe di sembrare viva a chi la guarda.
    expect(prossimoRitardoMs(20)).toBe(60_000)
  })
})

describe('svuota, chiamata a coda vuota', () => {
  it('non si inchioda per il resto della sessione', async () => {
    // All'avvio la coda e' vuota quasi sempre, e l'app spinge subito. Se quella
    // prima spinta lasciasse `inCorso` valorizzato, ogni invio successivo
    // uscirebbe senza spedire: la cassa accoderebbe tutta la serata senza
    // consegnare niente, e nessuno se ne accorgerebbe fino a fine sagra.
    const inviate: string[] = []
    const { c } = coda(async (rpc) => { inviate.push(rpc) })

    await c.svuota()
    c.accoda('b1', 'registra_vendite', { p_righe: [] })
    await c.svuota()

    expect(inviate).toEqual(['registra_vendite'])
    expect(c.inAttesa()).toBe(0)
  })

  it('regge anche due giri a vuoto di fila', async () => {
    const inviate: string[] = []
    const { c } = coda(async (rpc) => { inviate.push(rpc) })

    await c.svuota()
    await c.svuota()
    c.accoda('b1', 'registra_vendite', {})
    await c.svuota()

    expect(inviate).toHaveLength(1)
  })
})
