import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Ruolo } from '../lib/tipi'

export type Profilo = {
  id: string
  nome: string
  role: Ruolo
}

/** L'ultimo profilo noto, per l'apertura senza rete: l'hub ha bisogno di
    nome e ruolo, e la cassa deve restare raggiungibile anche senza campo. */
const CHIAVE_PROFILO = 'veneto.profilo'

function profiloDaCache(userId: string): Profilo | null {
  try {
    const grezzo = localStorage.getItem(CHIAVE_PROFILO)
    const p = grezzo ? (JSON.parse(grezzo) as Profilo) : null
    // La cache di un altro account non vale niente: meglio aspettare la rete
    // che salutare col nome di qualcun altro e col suo ruolo.
    return p && p.id === userId ? p : null
  } catch {
    return null
  }
}

type Ctx = {
  session: Session | null
  profilo: Profilo | null
  /** L'account esiste in Auth ma non ha una riga in `profiles`: il database
      ha risposto, e ha risposto zero righe. Da non confondere con «non è
      ancora arrivata la risposta», che vale invece a `false` con `profilo`
      nullo. */
  profiloAssente: boolean
  caricamento: boolean
  esci: () => Promise<void>
}

const SessionContext = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profilo, setProfilo] = useState<Profilo | null>(null)
  const [profiloAssente, setProfiloAssente] = useState(false)
  const [caricamento, setCaricamento] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCaricamento(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfilo(null)
      setProfiloAssente(false)
      return
    }
    // Prima la copia in tasca, poi la rete: senza campo l'app si apre lo
    // stesso, e quando la risposta arriva corregge in silenzio.
    setProfiloAssente(false)
    setProfilo(profiloDaCache(session.user.id))
    supabase
      .from('profiles')
      .select('id, nome, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        // PGRST116 = `single()` su zero righe. E' l'unico caso in cui si puo'
        // dire che il profilo NON c'e': ogni altro errore e' rete o permessi,
        // e li' la copia in tasca vale piu' di una schermata di scuse.
        if (error?.code === 'PGRST116') {
          setProfilo(null)
          setProfiloAssente(true)
          try {
            localStorage.removeItem(CHIAVE_PROFILO)
          } catch {
            // Storage negato: al massimo resta un nome vecchio in tasca.
          }
          return
        }
        if (!data) return
        setProfilo(data as Profilo)
        setProfiloAssente(false)
        try {
          localStorage.setItem(CHIAVE_PROFILO, JSON.stringify(data))
        } catch {
          // Storage pieno o negato: si perde solo l'apertura offline.
        }
      })
  }, [session])

  const esci = async () => {
    await supabase.auth.signOut()
  }

  return (
    <SessionContext.Provider value={{ session, profilo, profiloAssente, caricamento, esci }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessione() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSessione va usato dentro SessionProvider')
  return ctx
}
