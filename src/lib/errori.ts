/**
 * Il database è l'autorità, quindi è lui che rifiuta — ma rifiuta in inglese e
 * citando nomi di vincoli. Questo modulo è l'unico punto in cui quel testo
 * diventa una frase che ha senso per il capo stand.
 *
 * Ciò che non è riconosciuto NON viene mostrato: un messaggio di Postgres a
 * schermo non aiuta chi legge e dice a chi non dovrebbe come è fatto lo schema.
 */

const GENERICO = 'Qualcosa è andato storto. Riprova.'

type ErroreGrezzo = { message?: string | null; code?: string | null }

const REGOLE: Array<{ quando: RegExp; dice: string }> = [
  { quando: /prodotti_edizione_id_nome_key/, dice: 'C’è già una voce con questo nome nel menu.' },
  { quando: /edizioni_anno_key/, dice: 'C’è già un’edizione per quell’anno.' },
  { quando: /edizioni_una_sola_aperta/, dice: 'C’è già un’edizione aperta: chiuderla prima.' },
  { quando: /prodotti_prezzo_cent_check/, dice: 'Il prezzo deve essere maggiore di zero.' },
  { quando: /prodotti_colore_formato/, dice: 'Quel colore non è nel formato giusto.' },
  {
    quando: /prodotti_offerta_coerente/,
    dice: 'Un’offerta ha bisogno di quanti pezzi si scelgono e di che tipo.',
  },
  {
    quando: /vendite_prodotto_id_fkey/,
    dice: 'Questa voce è già stata venduta: si nasconde, non si elimina.',
  },
  {
    quando: /vendite_edizione_id_fkey/,
    dice: 'Questa edizione ha delle vendite: non si elimina.',
  },
  { quando: /violates foreign key constraint/, dice: 'Qualcos’altro dipende da questa riga: non si elimina.' },
  { quando: /row-level security|permission denied|insufficient privilege/i, dice: 'Serve il permesso del capo.' },
  { quando: /jwt|not authenticated|invalid token/i, dice: 'L’accesso è scaduto: esci e rientra.' },
  {
    quando: /failed to fetch|networkerror|network request failed|fetch failed/i,
    dice: 'Nessuna rete. Riprova quando torna la linea.',
  },
]

/** Prima lettera maiuscola e un punto in fondo, senza raddoppiarlo. */
function frase(testo: string): string {
  const s = testo.trim()
  if (!s) return GENERICO
  const con = s[0].toUpperCase() + s.slice(1)
  return /[.!?]$/.test(con) ? con : `${con}.`
}

export function messaggioErrore(errore: unknown): string {
  if (errore === null || errore === undefined) return GENERICO

  const e = errore as ErroreGrezzo
  const testo = typeof e.message === 'string' ? e.message : String(errore)

  for (const regola of REGOLE) {
    if (regola.quando.test(testo)) return regola.dice
  }

  // P0001 è il codice di un `raise exception` nostro: quei messaggi sono già
  // scritti in italiano e per un umano. Ripeterli qui vorrebbe dire tenerli
  // allineati in due posti, e prima o poi non lo sarebbero più.
  if (e.code === 'P0001') return frase(testo)

  return GENERICO
}
