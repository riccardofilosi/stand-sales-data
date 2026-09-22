import { type ReactNode } from 'react'
import { useConfermaDoppia } from '../lib/confermaDoppia'
import type { StatoEdizione } from '../lib/tipi'
import { sezioniEdizione, type SezioneEdizione } from './sezioni'

/**
 * I pezzi del guscio a due piani: la cornice, la testata con la freccia
 * indietro e la fila di pastiglie dentro l'edizione. La tendina «Sezioni»
 * non esiste più: sei voci sullo stesso piano non erano sei cose uguali.
 *
 * Non conosce Supabase né i contesti: riceve tutto per proprietà, così si
 * monta in un test senza finti client. A collegarlo è `App.tsx`.
 */

export function Schermo({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh flex flex-col">{children}</div>
}

export function Corpo({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</main>
  )
}

export function PillStato({ stato }: { stato: StatoEdizione }) {
  const tinta =
    stato === 'aperta'
      ? { background: 'rgba(79,160,220,.16)', color: '#4FA0DC' }
      : stato === 'bozza'
        ? { background: 'rgba(217,160,32,.14)', color: '#D9A020' }
        : { background: 'var(--surf2)', color: 'var(--muted)' }
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.06em]"
      style={tinta}
    >
      {stato === 'bozza' ? 'in preparazione' : stato}
    </span>
  )
}

/**
 * La testata di ogni schermata sotto l'hub: freccia, titolo, ed
 * eventualmente qualcosa a destra (la pastiglia di stato, il totale).
 *
 * `costaUscire` è il caso della cassa con un ordine battuto e non ancora
 * registrato: il primo tocco arma la freccia — rossa, col motivo accanto —
 * e il secondo esce davvero. Si disarma da sola, come ogni cosa armata.
 */
export function Testata({
  titolo,
  onIndietro,
  costaUscire = false,
  destra,
}: {
  titolo: ReactNode
  onIndietro: () => void
  costaUscire?: boolean
  destra?: ReactNode
}) {
  const { armato, arma, disarma } = useConfermaDoppia()

  const indietro = () => {
    if (costaUscire && !armato) {
      arma()
      return
    }
    disarma()
    onIndietro()
  }

  return (
    <header
      className="sticky top-0 z-10 flex items-center gap-3 px-4 pb-3
                 pt-[max(0.875rem,env(safe-area-inset-top))]"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}
    >
      <button
        type="button"
        aria-label="Indietro"
        aria-live="polite"
        onClick={indietro}
        className={
          armato && costaUscire
            ? 'bottone-armato rounded-[14px] min-h-[48px] px-3 text-[13px] font-semibold'
            : 'bottone-quieto w-12 min-h-[48px] text-[19px]'
        }
      >
        {armato && costaUscire ? 'Ordine non registrato — esci?' : '‹'}
      </button>
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <p className="text-[17px] font-semibold leading-tight truncate">{titolo}</p>
      </div>
      {destra}
    </header>
  )
}

/**
 * Le pastiglie dentro l'edizione. In cassa non si disegnano: lo schermo è
 * della griglia, e un menu vicino alle targhe si sfiora mentre si registra.
 */
export function Pastiglie({
  stato,
  sezione,
  vaiA,
}: {
  stato: StatoEdizione
  sezione: SezioneEdizione
  vaiA: (s: SezioneEdizione) => void
}) {
  return (
    <nav
      aria-label="Sezioni dell’edizione"
      className="flex gap-1.5 px-4 py-2.5 overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {sezioniEdizione(stato).map((v) => (
        <button
          key={v.chiave}
          type="button"
          aria-current={v.chiave === sezione ? 'page' : undefined}
          disabled={!v.attiva}
          // Il motivo sta nel nome accessibile: una pastiglia spenta senza
          // spiegazione sembra un guasto, non una regola.
          aria-label={v.attiva ? v.titolo : `${v.titolo} — ${v.motivo}`}
          title={v.attiva ? undefined : v.motivo}
          onClick={() => vaiA(v.chiave)}
          className="pastiglia shrink-0 aria-[current=page]:bg-[var(--act-bg)]
                     aria-[current=page]:text-[var(--act-ink)] disabled:opacity-35"
          style={{ background: v.chiave === sezione ? undefined : 'var(--surf2)' }}
        >
          {v.titolo}
        </button>
      ))}
    </nav>
  )
}
