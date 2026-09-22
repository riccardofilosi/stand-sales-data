/**
 * Le righe del database viste dal client. I nomi delle proprietà sono quelli
 * delle colonne. Lo schema originale sta in `supabase/migrations/024_*.sql`.
 */

export type StatoEdizione = 'bozza' | 'aperta' | 'chiusa'

/** `capo` decide (menu, edizione, storni altrui); `operatore` incassa. */
export type Ruolo = 'capo' | 'operatore'

export type Edizione = {
  id: string
  anno: number
  nome: string
  stato: StatoEdizione
  aperta_il: string | null
  chiusa_il: string | null
}

export type TipoProdotto = 'cibo' | 'bevanda' | 'offerta'

export type Prodotto = {
  id: string
  edizione_id: string
  nome: string
  tipo: TipoProdotto
  /** Nullo si tollera in bozza: `apri_edizione()` non apre finché ce n'è uno. */
  prezzo_cent: number | null
  colore: string
  ordine: number
  nascosto: boolean
  /** Solo offerte: quanti componenti si scelgono. */
  pezzi_scelta: number | null
  /** Solo offerte: fra quali tipi. */
  tipi_scelta: TipoProdotto[] | null
}

/**
 * Una riga registrata. `gesto_id` lega l'offerta ai suoi componenti;
 * `ordine_id` lega tutte le righe di un cliente.
 */
export type Vendita = {
  id: string
  prodotto_id: string
  /** Negativa sugli storni. */
  quantita: number
  prezzo_cent: number
  ordine_id: string
  gesto_id: string
  dentro_offerta: boolean
  operatore_id: string
  registrato_il: string
  storna_id: string | null
}

export const COLONNE_VENDITA =
  'id, prodotto_id, quantita, prezzo_cent, ordine_id, gesto_id, dentro_offerta, operatore_id, registrato_il, storna_id'
