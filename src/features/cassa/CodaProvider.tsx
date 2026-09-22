import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { messaggioErrore } from '../../lib/errori'
import { creaCoda, ErrorePermanente, type Busta, type Coda } from '../../lib/coda'

type Ctx = { coda: Coda; inAttesa: number; respinte: Busta[] }

const CodaContext = createContext<Ctx | null>(null)

/**
 * Distingue «riprova fra poco» da «non riprovare mai piu'».
 *
 * Postgres ha capito e ha rifiutato: la busta non guarira' aspettando, e va
 * messa da parte perche' qualcuno la guardi. La rete caduta invece guarisce da
 * sola, e la busta deve restare in fila. Sbagliare questa distinzione o perde
 * righe vere o le rinvia all'infinito.
 */
async function invia(rpc: string, payload: unknown): Promise<void> {
  const { error } = await supabase.rpc(rpc, payload as Record<string, unknown>)
  if (!error) return
  if (error.code) throw new ErrorePermanente(messaggioErrore(error))
  throw new Error(error.message)
}

export function CodaProvider({ children }: { children: ReactNode }) {
  const coda = useMemo(() => creaCoda({ invia, memoria: window.localStorage }), [])
  const [stato, impostaStato] = useState({
    inAttesa: coda.inAttesa(),
    respinte: coda.respinte(),
  })

  useEffect(() => {
    const aggiorna = () =>
      impostaStato({ inAttesa: coda.inAttesa(), respinte: coda.respinte() })
    const stacca = coda.sottoscrivi(aggiorna)

    // Tre spinte: la rete che torna, l'app che riappare in primo piano dopo
    // essere stata in tasca, e un battito lento per il caso in cui il telefono
    // creda di avere rete e non ce l'abbia.
    const spingi = () => void coda.svuota()
    window.addEventListener('online', spingi)
    document.addEventListener('visibilitychange', spingi)
    const battito = window.setInterval(spingi, 15_000)
    spingi()

    return () => {
      stacca()
      window.removeEventListener('online', spingi)
      document.removeEventListener('visibilitychange', spingi)
      window.clearInterval(battito)
    }
  }, [coda])

  return <CodaContext.Provider value={{ coda, ...stato }}>{children}</CodaContext.Provider>
}

export function useCoda(): Ctx {
  const ctx = useContext(CodaContext)
  if (!ctx) throw new Error('useCoda va usato dentro CodaProvider')
  return ctx
}
