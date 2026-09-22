import { supabase } from '../../lib/supabase'
import { messaggioErrore } from '../../lib/errori'
import type { Prodotto, TipoProdotto } from '../../lib/tipi'
import { inFila } from './albero'

async function esegui<T>(richiesta: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await richiesta
  if (error) throw new Error(messaggioErrore(error))
  return data
}

const COLONNE = 'id, edizione_id, nome, tipo, prezzo_cent, colore, ordine, nascosto, pezzi_scelta, tipi_scelta'

export async function leggiMenu(edizioneId: string): Promise<Prodotto[]> {
  const righe = await esegui(supabase.from('prodotti').select(COLONNE).eq('edizione_id', edizioneId))
  return inFila((righe ?? []) as unknown as Prodotto[])
}

export type NuovaVoce = {
  edizione_id: string
  nome: string
  tipo: TipoProdotto
  prezzo_cent: number | null
  colore: string
  ordine: number
  pezzi_scelta: number | null
  tipi_scelta: TipoProdotto[] | null
}

export const aggiungiVoce = (voce: NuovaVoce) => esegui(supabase.from('prodotti').insert(voce))

export const aggiorna = (id: string, campi: Partial<Omit<Prodotto, 'id' | 'edizione_id'>>) =>
  esegui(supabase.from('prodotti').update(campi).eq('id', id))

/** Eliminare è ammesso; se già venduta, il database rifiuta e si nasconde. */
export const elimina = (id: string) => esegui(supabase.from('prodotti').delete().eq('id', id))

export async function riscriviOrdine(righe: readonly { id: string; ordine: number }[]) {
  for (const r of righe) await esegui(supabase.from('prodotti').update({ ordine: r.ordine }).eq('id', r.id))
}
