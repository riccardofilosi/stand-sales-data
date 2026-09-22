import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type Ctx = { sospeso: boolean; impostaSospeso: (v: boolean) => void }

const SospesoContext = createContext<Ctx | null>(null)

/**
 * Se la Cassa ha una distinta in corso o un lotto ancora trattenuto, uscire
 * dall'app li perde senza lasciare traccia — non sono ancora nella coda.
 * Questo contesto lascia che `Guscio` lo sappia senza dover conoscere la
 * Cassa: la Cassa scrive, `Guscio` legge.
 */
export function SospesoProvider({ children }: { children: ReactNode }) {
  const [sospeso, impostaSospeso] = useState(false)
  // Un oggetto nuovo a ogni render ridisegnerebbe l'app intera — il provider
  // sta sopra tutto — e la Cassa e' l'ultimo posto dove sprecare fotogrammi.
  // `impostaSospeso` di useState ha gia' riferimento stabile.
  const valore = useMemo(() => ({ sospeso, impostaSospeso }), [sospeso])
  return <SospesoContext.Provider value={valore}>{children}</SospesoContext.Provider>

}

export function useSospeso(): Ctx {
  const ctx = useContext(SospesoContext)
  if (!ctx) throw new Error('useSospeso va usato dentro SospesoProvider')
  return ctx
}
