import type { Fascia } from '../../lib/andamento'
import { etichetteVisibili, scala } from '../../lib/assi'
import { cumulate } from '../../lib/andamento'

export type Forma = 'blocchi' | 'linea' | 'cumulato'

/** Una linea per prodotto: i valori seguono le fasce, uno per fascia. */
export type Serie = { id: string; colore: string; valori: number[] }

const W = 320
const H = 152
const L = 3
const R = 286
const T = 10
const B = 126

/**
 * Tre forme dello stesso dato, sulla stessa griglia: a blocchi il volume di
 * ogni mezz'ora, a linea la curva della serata, cumulato il totale che sale.
 *
 * In tutte e tre la fascia in corso è tratteggiata. Alle 23:14 quella fascia
 * vale quattordici minuti su trenta: disegnata piena sembrerebbe un crollo
 * delle vendite, e qualcuno manderebbe a casa metà squadra per niente.
 */
export function Grafico({ fasce, forma, serie = [] }: { fasce: readonly Fascia[]; forma: Forma; serie?: readonly Serie[] }) {
  if (fasce.length === 0) {
    return <p className="tenue text-[13px] py-8 text-center">Ancora nessun movimento.</p>
  }

  const cum = forma === 'cumulato'
  const serieAggregata = cum ? cumulate(fasce) : fasce.map((f) => f.pezzi)
  const massimo = serie.length > 0 ? Math.max(...serie.flatMap((s) => s.valori), 1) : Math.max(...serieAggregata, 1)
  const { passo, cima } = scala(massimo)
  const iCorrente = fasce.length - 1

  const passoX = (R - L) / fasce.length
  const cx = (i: number) => L + passoX * (i + 0.5)
  const cy = (v: number) => B - (v / cima) * (B - T)

  const griglia = [0, 1, 2, 3].map((k) => {
    const v = passo * k
    const y = cy(v)
    return (
      <g key={k}>
        <line className={k ? 'griglia' : 'base'} x1={L} y1={y} x2={R} y2={y} />
        <text className="asse" x={R + 6} y={y} dominantBaseline="middle">
          {v}
        </text>
      </g>
    )
  })

  // L'ora piena e i minuti, non la sola ora: a mezz'ora due etichette vicine
  // direbbero «23» e «23», e non si capirebbe quale metà si sta guardando.
  // Agli estremi l'ancoraggio cambia, o la prima esce a sinistra del riquadro
  // e l'ultima finisce sotto i numeri dell'asse dei valori.
  const viste = etichetteVisibili(fasce.length)
  const assex = fasce.map((f, i) =>
    viste.has(i) ? (
      <text
        key={i}
        className="asse"
        x={cx(i)}
        y={B + 16}
        textAnchor={i === 0 ? 'start' : i === fasce.length - 1 ? 'end' : 'middle'}
      >
        {f.etichetta}
      </text>
    ) : null,
  )

  let disegno
  if (serie.length > 0) {
    disegno = serie.map((s) => {
      const punti = s.valori.map((v, i) => [cx(i), cy(v)] as const)
      const d = punti.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
      return (
        <g key={s.id}>
          <path d={d} fill="none" stroke={s.colore} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={punti[iCorrente][0]} cy={punti[iCorrente][1]} r={3.5} fill={s.colore} />
        </g>
      )
    })
  } else if (forma === 'blocchi') {
    // Su una sessione lunga le colonne si assottigliano: l'angolo arrotondato
    // va tenuto sotto la metà della larghezza, o una colonna da due punti
    // diventa una pillola e la sua altezza smette di leggersi.
    const larghezza = Math.max(passoX * 0.6, 1)
    disegno = serieAggregata.map((v, i) => {
      const y = cy(v)
      return (
        <rect
          key={i}
          className={i === iCorrente ? 'parziale' : 'colonna'}
          x={cx(i) - larghezza / 2}
          y={y}
          width={larghezza}
          height={Math.max(B - y, 1.5)}
          rx={Math.min(2, larghezza / 2)}
        />
      )
    })
  } else {
    const punti = serieAggregata.map((v, i) => [cx(i), cy(v)] as const)
    const pieni = punti.slice(0, iCorrente)
    const d = pieni.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    const ultimo = punti[Math.max(iCorrente - 1, 0)]
    const corrente = punti[iCorrente]
    disegno = (
      <>
        {pieni.length > 1 && (
          <path
            fill="url(#sfumatura)"
            d={`${d} L ${ultimo[0].toFixed(1)} ${B} L ${punti[0][0].toFixed(1)} ${B} Z`}
          />
        )}
        {pieni.length > 1 && <path className="tratto" d={d} />}
        <path
          className="coda-tratteggiata"
          d={`M ${ultimo[0].toFixed(1)} ${ultimo[1].toFixed(1)} L ${corrente[0].toFixed(1)} ${corrente[1].toFixed(1)}`}
        />
        <circle className="punto" cx={corrente[0]} cy={corrente[1]} r={4} />
      </>
    )
  }

  return (
    <svg
      className="tela w-full block num"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${cum ? 'Totale progressivo' : serie.length > 0 ? 'Pezzi per prodotto per mezz’ora' : 'Pezzi per mezz’ora'} dalle ${fasce[0].etichetta} alle ${fasce[iCorrente].etichetta}`}
    >
      <defs>
        <linearGradient id="sfumatura" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {griglia}
      {disegno}
      {assex}
    </svg>
  )
}
