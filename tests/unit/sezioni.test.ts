import { describe, it, expect } from 'vitest'
import { atterraggio, hashDi, puoVedere, rottaDaHash, sezioniEdizione } from '../../src/guscio/sezioni'

describe('sezioniEdizione', () => {
  it('a edizione aperta accende tutto', () => {
    expect(sezioniEdizione('aperta').every((v) => v.attiva)).toBe(true)
  })

  it('in bozza spegne cassa e andamento, e dice perché', () => {
    const voci = sezioniEdizione('bozza')
    const cassa = voci.find((v) => v.chiave === 'cassa')
    expect(cassa?.attiva).toBe(false)
    expect(cassa?.motivo).toMatch(/si apre prima/)
    expect(voci.find((v) => v.chiave === 'andamento')?.attiva).toBe(false)
    expect(voci.find((v) => v.chiave === 'listino')?.attiva).toBe(true)
  })

  it('a edizione chiusa spegne la sola cassa', () => {
    const voci = sezioniEdizione('chiusa')
    expect(voci.find((v) => v.chiave === 'cassa')?.attiva).toBe(false)
    expect(voci.find((v) => v.chiave === 'andamento')?.attiva).toBe(true)
  })
})

describe('puoVedere', () => {
  it('l hub è di tutti', () => {
    expect(puoVedere('operatore', { schermo: 'hub' })).toBe(true)
    expect(puoVedere('capo', { schermo: 'hub' })).toBe(true)
    expect(puoVedere(null, { schermo: 'hub' })).toBe(false)
  })

  it('l operatore vede la cassa e basta', () => {
    expect(puoVedere('operatore', { schermo: 'edizione', id: 'x', sezione: 'cassa' })).toBe(true)
    expect(puoVedere('operatore', { schermo: 'edizione', id: 'x', sezione: 'andamento' })).toBe(false)
    expect(puoVedere('operatore', { schermo: 'edizioni' })).toBe(false)
  })

  it('il capo vede tutto', () => {
    expect(puoVedere('capo', { schermo: 'edizioni' })).toBe(true)
    expect(puoVedere('capo', { schermo: 'edizione', id: 'x', sezione: 'listino' })).toBe(true)
  })
})

describe('hash', () => {
  it('va e torna', () => {
    const r = { schermo: 'edizione', id: 'abc', sezione: 'cassa' } as const
    expect(rottaDaHash(hashDi(r))).toEqual(r)
    expect(rottaDaHash('#edizioni')).toEqual({ schermo: 'edizioni' })
    expect(rottaDaHash('#persone')).toBeNull()
    expect(rottaDaHash('#ed/abc/acquisti')).toBeNull()
  })

  it('atterraggio: bozza → menu, altrimenti andamento', () => {
    expect(atterraggio('bozza')).toBe('listino')
    expect(atterraggio('aperta')).toBe('andamento')
  })
})
