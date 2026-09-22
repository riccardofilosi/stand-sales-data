import { TINTE, inchiostroPerSmalto } from '../../lib/colori'

/**
 * La barra dei colori: venti pastiglie in fila, si scorre col dito. Il
 * ventaglio resta chiuso (niente selettore libero): due tinte indistinguibili
 * non devono poter nascere, e la curatela sta in `lib/colori.ts`.
 *
 * Il segno di scelta è un carattere, non solo il bordo: il colore non porta
 * mai da solo un'informazione.
 */
export function SceltaColore({
  valore,
  onScegli,
}: {
  valore: string
  onScegli: (hex: string) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Colore del prodotto"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {TINTE.map((tinta) => {
        const scelto = tinta.hex === valore.toUpperCase()
        return (
          <button
            key={tinta.hex}
            type="button"
            role="radio"
            aria-checked={scelto}
            aria-label={tinta.nome}
            onClick={() => onScegli(tinta.hex)}
            className="targa grid place-items-center w-12 h-12 min-h-0 shrink-0 text-[22px] font-bold"
            style={{ background: tinta.hex, color: inchiostroPerSmalto(tinta.hex) }}
          >
            {scelto ? '✓' : ''}
          </button>
        )
      })}
    </div>
  )
}
