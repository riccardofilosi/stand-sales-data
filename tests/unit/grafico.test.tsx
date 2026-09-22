import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Grafico } from '../../src/features/andamento/Grafico'
import { etichetteVisibili } from '../../src/lib/assi'
import type { Fascia } from '../../src/lib/andamento'

/** Una serata finta, lunga quanto serve alla prova. */
const fasce = (quante: number): Fascia[] =>
  Array.from({ length: quante }, (_, i) => {
    const min = i * 30
    return {
      etichetta: `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${min % 60 === 0 ? '00' : '30'}`,
      pezzi: 10 + (i % 7) * 12,
      incassoCent: 1000,
      corrente: i === quante - 1,
    }
  })

describe('etichetteVisibili', () => {
  it('una serata vera le tiene quasi tutte', () => {
    expect(etichetteVisibili(14).size).toBeLessThanOrEqual(6)
  })

  it('una sessione lasciata aperta da ieri non ne stampa cento', () => {
    // È il caso che rendeva l'asse una striscia nera.
    expect(etichetteVisibili(100).size).toBeLessThanOrEqual(6)
    expect(etichetteVisibili(400).size).toBeLessThanOrEqual(6)
  })

  it('l ultima c è sempre: l ora di adesso è quella che si cerca', () => {
    for (const n of [1, 5, 14, 47, 100]) {
      expect(etichetteVisibili(n).has(n - 1)).toBe(true)
    }
  })

  it('con pochissime fasce non ne inventa né ne salta', () => {
    expect([...etichetteVisibili(3)].sort((a, b) => a - b)).toEqual([0, 1, 2])
  })
})

describe('Grafico', () => {
  const xDelleEtichette = (c: HTMLElement) =>
    [...c.querySelectorAll('text.asse')]
      .map((t) => Number(t.getAttribute('x')))
      // Le etichette dei valori stanno a destra del riquadro di disegno.
      .filter((x) => x < 287)
      .sort((a, b) => a - b)

  it('su una sessione lunga le etichette del tempo non si toccano', () => {
    const { container } = render(<Grafico fasce={fasce(96)} forma="blocchi" />)
    const x = xDelleEtichette(container)
    expect(x.length).toBeGreaterThan(1)
    // «23:30» a 8.5px occupa una ventina di unità: sotto le 30 si toccano.
    for (let i = 1; i < x.length; i++) expect(x[i] - x[i - 1]).toBeGreaterThan(30)
  })

  it('scrive ora e minuti, o due mezz ore direbbero lo stesso numero', () => {
    const { container } = render(<Grafico fasce={fasce(14)} forma="blocchi" />)
    const testi = [...container.querySelectorAll('text.asse')].map((t) => t.textContent)
    expect(testi.some((t) => /^\d{2}:\d{2}$/.test(t ?? ''))).toBe(true)
  })

  it('disegna una colonna per fascia, l ultima tratteggiata', () => {
    const { container } = render(<Grafico fasce={fasce(14)} forma="blocchi" />)
    expect(container.querySelectorAll('rect')).toHaveLength(14)
    expect(container.querySelectorAll('rect.parziale')).toHaveLength(1)
  })

  it('a linea la coda resta tratteggiata e il punto di adesso è vuoto', () => {
    const { container } = render(<Grafico fasce={fasce(14)} forma="linea" />)
    expect(container.querySelector('path.coda-tratteggiata')).toBeTruthy()
    expect(container.querySelector('circle.punto')).toBeTruthy()
  })

  it('senza fasce non disegna assi vuoti, lo dice', () => {
    const { container } = render(<Grafico fasce={[]} forma="blocchi" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('con serie per prodotto disegna una linea per serie, col suo colore', () => {
    const { container } = render(
      <Grafico
        fasce={fasce(3)}
        forma="linea"
        serie={[
          { id: 'a', colore: '#B84A10', valori: [1, 2, 0] },
          { id: 'b', colore: '#0B63A8', valori: [0, 1, 1] },
        ]}
      />,
    )
    const linee = container.querySelectorAll('path[stroke]')
    expect(linee).toHaveLength(2)
    expect(linee[0].getAttribute('stroke')).toBe('#B84A10')
  })

  it('regge una sola fascia senza rompersi sul punto precedente', () => {
    const { container } = render(<Grafico fasce={fasce(1)} forma="linea" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
