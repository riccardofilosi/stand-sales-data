import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { messaggioErrore } from '../lib/errori'
import type { Edizione } from '../lib/tipi'
import { scegliCorrente } from './sagra'

/** L'ultimo elenco noto, per l'hub senza rete: la cassa deve restare
    raggiungibile anche quando l'elenco non si può rileggere. */
const CHIAVE_CACHE = 'veneto.edizioni'

function daCache(): Edizione[] {
  try {
    const grezzo = localStorage.getItem(CHIAVE_CACHE)
    return grezzo ? (JSON.parse(grezzo) as Edizione[]) : []
  } catch {
    return []
  }
}

type Ctx = {
  /** Tutte le edizioni, dalla più recente. */
  edizioni: Edizione[]
  /** Quella su cui si sta lavorando. Vedi `scegliCorrente`; l'URL può
      sceglierne un'altra con `scegli`. */
  corrente: Edizione | null
  /** Aggancia la scelta all'URL (`#ed/<id>/…`). `null` torna alla regola. */
  scegli: (id: string | null) => void
  caricamento: boolean
  errore: string | null
  ricarica: () => Promise<void>
}

const SagraContext = createContext<Ctx | null>(null)

export function SagraProvider({ children }: { children: ReactNode }) {
  const [edizioni, setEdizioni] = useState<Edizione[]>(daCache)
  const [sceltaId, setSceltaId] = useState<string | null>(null)
  // Con una copia in tasca non si sta a guardare una rotellina: si disegna
  // quella e si aggiorna in silenzio quando la rete risponde.
  const [caricamento, setCaricamento] = useState(() => daCache().length === 0)
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    const { data, error } = await supabase
      .from('edizioni')
      .select('id, anno, nome, stato, aperta_il, chiusa_il')
      .order('anno', { ascending: false })

    if (error) {
      setErrore(messaggioErrore(error))
    } else {
      setErrore(null)
      setEdizioni((data ?? []) as Edizione[])
      try {
        localStorage.setItem(CHIAVE_CACHE, JSON.stringify(data ?? []))
      } catch {
        // Quota piena o storage negato: l'app resta giusta, perde solo il ricordo.
      }
    }
    setCaricamento(false)
  }, [])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  const scelta = sceltaId ? edizioni.find((e) => e.id === sceltaId) : undefined

  return (
    <SagraContext.Provider
      value={{
        edizioni,
        corrente: scelta ?? scegliCorrente(edizioni),
        scegli: setSceltaId,
        caricamento,
        errore,
        ricarica,
      }}
    >
      {children}
    </SagraContext.Provider>
  )
}

export function useSagra() {
  const ctx = useContext(SagraContext)
  if (!ctx) throw new Error('useSagra va usato dentro SagraProvider')
  return ctx
}
