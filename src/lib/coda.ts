/**
 * Errore che non guarira' aspettando: il server ha capito la richiesta e l'ha
 * rifiutata (sessione chiusa, offerta incompleta, prodotto inesistente).
 * Chi adatta questa coda a Supabase deve lanciare questo per gli errori di
 * Postgres e un Error qualsiasi per le cadute di rete: e' l'unica cosa che
 * distingue "riprova fra poco" da "non riprovare mai piu'".
 */
export class ErrorePermanente extends Error {}

export type Busta = {
  id: string
  rpc: string
  payload: unknown
  tentativi: number
  errore?: string
}

export type Coda = {
  accoda(id: string, rpc: string, payload: unknown): void
  buste(): Busta[]
  inAttesa(): number
  respinte(): Busta[]
  svuota(): Promise<void>
  sottoscrivi(ascoltatore: () => void): () => void
}

type Opzioni = {
  invia: (rpc: string, payload: unknown) => Promise<void>
  memoria: Storage
  chiave?: string
}

type Stato = { attesa: Busta[]; respinte: Busta[] }

export function prossimoRitardoMs(tentativi: number): number {
  return Math.min(60_000, 1000 * 2 ** tentativi)
}

export function creaCoda({ invia, memoria, chiave = 'veneto.coda' }: Opzioni): Coda {
  function leggi(): Stato {
    const grezzo = memoria.getItem(chiave)
    if (!grezzo) return { attesa: [], respinte: [] }
    try {
      const letto = JSON.parse(grezzo) as Partial<Stato>
      return {
        attesa: Array.isArray(letto.attesa) ? letto.attesa : [],
        respinte: Array.isArray(letto.respinte) ? letto.respinte : [],
      }
    } catch {
      // Una memoria corrotta non deve impedire di aprire la cassa: si riparte
      // vuoti. Le buste perse sono al massimo quelle non ancora partite.
      return { attesa: [], respinte: [] }
    }
  }

  // Mai riassegnato: si mutano le due liste dentro, e le funzioni qui sotto
  // continuano a vedere lo stesso oggetto.
  const stato = leggi()
  const ascoltatori = new Set<() => void>()
  let inCorso: Promise<void> | null = null

  function salva() {
    memoria.setItem(chiave, JSON.stringify(stato))
    for (const a of ascoltatori) a()
  }

  return {
    accoda(id, rpc, payload) {
      const gia = stato.attesa.some((b) => b.id === id) ||
                  stato.respinte.some((b) => b.id === id)
      if (gia) return
      stato.attesa.push({ id, rpc, payload, tentativi: 0 })
      salva()
    },

    buste: () => [...stato.attesa],
    inAttesa: () => stato.attesa.length,
    respinte: () => [...stato.respinte],

    svuota() {
      // Due chiamate concorrenti manderebbero la stessa busta due volte. Il
      // database la scarterebbe (chiave primaria), ma sprecare la rete proprio
      // quando manca e' il momento peggiore per farlo.
      if (inCorso) return inCorso
      // `finally` DOPO la promessa, non dentro la funzione asincrona.
      //
      // A coda vuota il corpo qui sotto arriva in fondo senza mai sospendersi:
      // un `finally` interno azzererebbe `inCorso` prima che l'assegnazione
      // qui sotto lo riempia, e la promessa gia' risolta resterebbe dentro per
      // sempre. Da li' in poi ogni svuota() uscirebbe alla prima riga senza
      // spedire niente, e siccome all'avvio la coda e' vuota quasi sempre,
      // bastava aprire l'app perche' la cassa smettesse di consegnare.
      inCorso = (async () => {
        while (stato.attesa.length > 0) {
          const busta = stato.attesa[0]
          try {
            await invia(busta.rpc, busta.payload)
            stato.attesa.shift()
            salva()
          } catch (errore) {
            if (errore instanceof ErrorePermanente) {
              stato.attesa.shift()
              stato.respinte.push({ ...busta, errore: errore.message })
              salva()
              continue
            }
            // Rete giu': lo e' anche per le buste dietro. Fermarsi qui tiene
            // l'ordine e non brucia batteria.
            busta.tentativi += 1
            salva()
            return
          }
        }
      })().finally(() => {
        inCorso = null
      })
      return inCorso
    },

    sottoscrivi(ascoltatore) {
      ascoltatori.add(ascoltatore)
      return () => { ascoltatori.delete(ascoltatore) }
    },
  }
}
