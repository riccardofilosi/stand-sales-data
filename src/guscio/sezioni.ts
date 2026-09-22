import { useEffect, useState } from 'react'
import type { Ruolo, StatoEdizione } from '../lib/tipi'

/**
 * Navigazione a due piani: l'hub all'apertura, le sezioni DENTRO l'edizione.
 * Una bozza si prepara, un'aperta vende, una chiusa si legge.
 */

export type SezioneEdizione = 'cassa' | 'andamento' | 'listino'

export type Rotta =
  | { schermo: 'hub' }
  | { schermo: 'edizioni' }
  | { schermo: 'edizione'; id: string; sezione: SezioneEdizione }

export type VoceSezione = {
  chiave: SezioneEdizione
  titolo: string
  attiva: boolean
  motivo?: string
}

export function sezioniEdizione(stato: StatoEdizione): VoceSezione[] {
  return [
    {
      chiave: 'cassa',
      titolo: 'Cassa',
      attiva: stato === 'aperta',
      motivo:
        stato === 'bozza' ? 'si apre prima l’edizione' : stato === 'chiusa' ? 'edizione chiusa' : undefined,
    },
    {
      chiave: 'andamento',
      titolo: 'Andamento',
      attiva: stato !== 'bozza',
      motivo: stato === 'bozza' ? 'ancora nessuna vendita' : undefined,
    },
    { chiave: 'listino', titolo: 'Menu', attiva: true },
  ]
}

/** L'operatore vede hub e cassa; il capo tutto. La RLS è il permesso vero. */
export function puoVedere(ruolo: Ruolo | null, rotta: Rotta): boolean {
  if (!ruolo) return false
  if (rotta.schermo === 'hub') return true
  if (ruolo === 'capo') return true
  return rotta.schermo === 'edizione' && rotta.sezione === 'cassa'
}

export function atterraggio(stato: StatoEdizione): SezioneEdizione {
  return stato === 'bozza' ? 'listino' : 'andamento'
}

const SEZIONI_VALIDE = new Set<string>(['cassa', 'andamento', 'listino'])

export function hashDi(rotta: Rotta): string {
  if (rotta.schermo === 'edizione') return `#ed/${rotta.id}/${rotta.sezione}`
  return `#${rotta.schermo}`
}

export function rottaDaHash(hash: string): Rotta | null {
  const pulito = hash.replace(/^#/, '')
  if (pulito === 'hub') return { schermo: 'hub' }
  if (pulito === 'edizioni') return { schermo: 'edizioni' }
  const pezzi = pulito.split('/')
  if (pezzi.length === 3 && pezzi[0] === 'ed' && pezzi[1] && SEZIONI_VALIDE.has(pezzi[2])) {
    return { schermo: 'edizione', id: pezzi[1], sezione: pezzi[2] as SezioneEdizione }
  }
  return null
}

export function useRottaUrl(): Rotta | null {
  const [rotta, impostaRotta] = useState<Rotta | null>(() => rottaDaHash(window.location.hash))
  useEffect(() => {
    const daUrl = () => impostaRotta(rottaDaHash(window.location.hash))
    window.addEventListener('hashchange', daUrl)
    return () => window.removeEventListener('hashchange', daUrl)
  }, [])
  return rotta
}

export function vaiA(rotta: Rotta) {
  window.location.hash = hashDi(rotta)
}
