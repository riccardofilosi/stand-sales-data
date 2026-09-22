import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { errore: Error | null }

/**
 * Ultima rete prima dello schermo bianco. Non prova a indovinare cosa è
 * andato storto: dice che qualcosa si è rotto e offre l'unica via d'uscita
 * affidabile, ricaricare. Non cattura errori fuori dal render (rifiuti di
 * promise, errori async): quelli restano dove già finiscono, nei riquadri
 * d'errore per-sezione che parlano di rete e permessi.
 *
 * Un Error Boundary deve essere una classe: è l'unico modo che React offre
 * per catturare errori di render.
 */
export class ErroreGlobale extends Component<Props, State> {
  state: State = { errore: null }

  static getDerivedStateFromError(errore: Error): State {
    return { errore }
  }

  componentDidCatch(errore: Error) {
    console.error('Errore non gestito nel render:', errore)
  }

  render() {
    if (this.state.errore) {
      return (
        <div className="min-h-dvh grid place-items-center p-6">
          <div role="alert" className="plancia p-5 w-full max-w-sm text-center">
            {/* Il rosso non porta mai da solo l'informazione: accanto c'è il
                segno, e sotto la frase che dice la stessa cosa a parole. */}
            <span
              aria-hidden="true"
              className="num grid place-items-center w-8 h-8 mx-auto rounded-[8px] text-[22px] font-bold"
              style={{ background: 'var(--rosso-fondo)', color: 'var(--ink)' }}
            >
              !
            </span>
            <h1 className="text-[22px] font-semibold mt-3">Qualcosa è andato storto</h1>
            <p className="tenue text-[15px] mt-2">
              L'app ha incontrato un errore che non sa gestire da sola. Le vendite già registrate
              restano al sicuro: sono nel database, non su questo schermo.
            </p>
            {/* 96px come in cassa e come sul bottone d'accesso: questa schermata
                può comparire in piedi, di fretta, ed è l'unico bersaglio a
                schermo — allargarlo non costa scorrimento a nessuno. */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bottone-forte w-full min-h-[96px] mt-5 text-[22px]"
            >
              Ricarica
            </button>

            {/* Il messaggio tecnico non serve a chi incassa, ma serve a chi
                ripara — e su un telefono la console non si apre. Sta chiuso:
                chi lo cerca lo trova, chi non lo cerca non lo vede. */}
            <details className="mt-4 text-left">
              <summary className="tenue text-[13px] cursor-pointer min-h-[44px] flex items-center">
                Dettagli tecnici
              </summary>
              <pre
                className="mt-2 p-3 rounded-[10px] text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
                style={{ background: 'var(--bg)', color: 'var(--rosso)' }}
              >
                {this.state.errore.message}
                {this.state.errore.stack ? `\n\n${this.state.errore.stack}` : ''}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
