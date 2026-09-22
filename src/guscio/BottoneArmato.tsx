import { useConfermaDoppia } from '../lib/confermaDoppia'

/**
 * I gesti che costano — chiudere un'edizione, eliminare una bozza, cambiare
 * il grado di una persona — vogliono un secondo tocco. Non un `confirm()`
 * di sistema: in standalone è una finestra estranea che blocca il thread.
 * È il bottone stesso che cambia parola e colore, e torna com'era da solo
 * se nessuno risponde.
 */
export function BottoneArmato({
  riposo,
  conferma,
  onConferma,
  disabilitato = false,
}: {
  riposo: string
  conferma: string
  onConferma: () => void
  disabilitato?: boolean
}) {
  const { armato, arma, disarma } = useConfermaDoppia()

  if (!armato) {
    return (
      <button
        type="button"
        onClick={arma}
        disabled={disabilitato}
        aria-live="polite"
        className="bottone-quieto min-h-[48px] px-4"
      >
        {riposo}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        disarma()
        onConferma()
      }}
      disabled={disabilitato}
      aria-live="polite"
      className="bottone-armato rounded-[14px] min-h-[48px] px-4 text-[13px] font-semibold"
    >
      {conferma}
    </button>
  )
}
