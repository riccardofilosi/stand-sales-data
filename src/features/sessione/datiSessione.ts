import { supabase } from '../../lib/supabase'
import { messaggioErrore } from '../../lib/errori'

async function esegui<T>(richiesta: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await richiesta
  if (error) throw new Error(messaggioErrore(error))
  return data
}

export const creaEdizione = (anno: number, nome: string) =>
  esegui(supabase.from('edizioni').insert({ anno, nome }))

/** RPC con i controlli dentro il database: il telefono non è l'autorità. */
export const apriEdizione = (p_edizione: string) => esegui(supabase.rpc('apri_edizione', { p_edizione }))
export const chiudiEdizione = () => esegui(supabase.rpc('chiudi_edizione'))
export const copiaMenu = (p_da: string, p_a: string) => esegui(supabase.rpc('copia_menu', { p_da, p_a }))

/** Solo le bozze; un'edizione con vendite la ferma la chiave esterna. */
export const eliminaBozza = (id: string) =>
  esegui(supabase.from('edizioni').delete().eq('id', id).eq('stato', 'bozza'))
