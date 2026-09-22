import { useEffect, useState, type KeyboardEvent } from 'react'

type Props = {
  valore: string
  /** Va nel nome accessibile sia del bottone sia del campo. */
  etichetta: string
  onSalva: (nuovo: string) => void
  /** `decimal` sui prezzi: apre la tastiera numerica con la virgola. */
  tastiera?: 'text' | 'decimal'
  classe?: string
}

/**
 * Il testo è un bottone finché non lo si tocca, poi diventa un campo.
 *
 * Non si usa `prompt()`: blocca il thread, e su una PWA in standalone appare
 * come una finestra di sistema che non somiglia all'app. Non si usa nemmeno un
 * campo sempre aperto: trenta campi aperti su una pagina di listino invitano a
 * toccare quello sbagliato mentre si scorre.
 */
export function CampoInline({ valore, etichetta, onSalva, tastiera = 'text', classe = '' }: Props) {
  const [inModifica, setInModifica] = useState(false)
  const [bozza, setBozza] = useState(valore)

  // Se il valore cambia da fuori (ricarica dopo una scrittura), la bozza segue.
  useEffect(() => setBozza(valore), [valore])

  const chiudi = (salva: boolean) => {
    setInModifica(false)
    if (salva && bozza !== valore) onSalva(bozza)
    if (!salva) setBozza(valore)
  }

  const tasto = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      chiudi(true)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      chiudi(false)
    }
  }

  if (!inModifica) {
    return (
      <button
        type="button"
        aria-label={`${etichetta}: ${valore || 'vuoto'}`}
        onClick={() => setInModifica(true)}
        className={`text-left min-h-[48px] px-2 rounded-[10px] hover:bg-[var(--surf)] ${classe}`}
      >
        {valore || <span className="tenue">—</span>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      aria-label={etichetta}
      inputMode={tastiera}
      value={bozza}
      onChange={(e) => setBozza(e.target.value)}
      onBlur={() => chiudi(true)}
      onKeyDown={tasto}
      className={`campo min-h-[48px] px-3 ${classe}`}
    />
  )
}
