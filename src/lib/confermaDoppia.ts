import { useCallback, useEffect, useState } from 'react'

/**
 * Due tocchi invece di un `confirm()` di sistema, che su una PWA in standalone
 * appare come una finestra estranea e blocca il thread. Il primo tocco arma,
 * il secondo esegue; si disarma da solo dopo qualche secondo, cosi' un tocco
 * vecchio non conferma un'azione diversa da quella pensata.
 */
export function useConfermaDoppia(scadenzaMs = 4000) {
  const [armato, impostaArmato] = useState(false)

  useEffect(() => {
    if (!armato) return
    const scade = window.setTimeout(() => impostaArmato(false), scadenzaMs)
    return () => window.clearTimeout(scade)
  }, [armato, scadenzaMs])

  // I due comandi hanno riferimento stabile: chi disarma da un effetto (chiudere
  // una tendina, per dire) non deve rifare l'effetto a ogni render.
  const arma = useCallback(() => impostaArmato(true), [])
  const disarma = useCallback(() => impostaArmato(false), [])

  return { armato, arma, disarma }
}
