import { describe, it, expect } from 'vitest'
import { euro, centDaTesto, testoDaCent } from '../../src/lib/money'

describe('centDaTesto', () => {
  it('legge un intero come euro', () => {
    expect(centDaTesto('3')).toBe(300)
  })

  it('legge la virgola italiana', () => {
    expect(centDaTesto('3,50')).toBe(350)
  })

  it('accetta anche il punto, che la tastiera numerica propone', () => {
    expect(centDaTesto('3.50')).toBe(350)
  })

  it('completa un solo decimale', () => {
    // "3,5" sono tre euro e cinquanta, non tre euro e cinque centesimi.
    expect(centDaTesto('3,5')).toBe(350)
  })

  it('non passa dalla virgola mobile', () => {
    // 3.35 * 100 in JavaScript fa 334.99999999999994.
    expect(centDaTesto('3,35')).toBe(335)
  })

  it('legge i centesimi da soli', () => {
    expect(centDaTesto('0,05')).toBe(5)
  })

  it('ignora gli spazi intorno', () => {
    expect(centDaTesto('  2,5 ')).toBe(250)
  })

  it('rifiuta il vuoto', () => {
    expect(centDaTesto('')).toBeNull()
    expect(centDaTesto('   ')).toBeNull()
  })

  it('rifiuta i millesimi', () => {
    // Non arrotonda in silenzio: chi ha scritto 3,456 ha sbagliato a digitare
    // e deve vederlo, non ritrovarsi 3,46 in archivio.
    expect(centDaTesto('3,456')).toBeNull()
  })

  it('rifiuta il negativo e il non numerico', () => {
    expect(centDaTesto('-1')).toBeNull()
    expect(centDaTesto('tre euro')).toBeNull()
    expect(centDaTesto('3,,5')).toBeNull()
  })
})

describe('testoDaCent', () => {
  it('scrive sempre due decimali', () => {
    expect(testoDaCent(350)).toBe('3,50')
    expect(testoDaCent(5)).toBe('0,05')
    expect(testoDaCent(300)).toBe('3,00')
  })

  it('sul prezzo mancante restituisce la stringa vuota', () => {
    // Un prodotto in bozza puo' non avere ancora prezzo: il campo va vuoto,
    // non a "0,00", che sarebbe un prezzo vero e sbagliato.
    expect(testoDaCent(null)).toBe('')
  })

  it('e il contrario esatto di centDaTesto', () => {
    for (const cent of [0, 5, 99, 100, 350, 1234, 99999]) {
      expect(centDaTesto(testoDaCent(cent))).toBe(cent)
    }
  })
})

describe('euro', () => {
  it('resta quello che era', () => {
    expect(euro(350)).toContain('3,50')
  })
})
