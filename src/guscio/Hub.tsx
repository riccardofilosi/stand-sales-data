import type { Edizione, Ruolo } from '../lib/tipi'
import { PillStato } from './Guscio'
import { atterraggio, vaiA } from './sezioni'

/**
 * Il piano terra: l'edizione in corso è la targa centrale. L'operatore ci
 * trova la Cassa e basta; il capo anche Edizioni e l'andamento.
 */
export function Hub({
  nome,
  ruolo,
  corrente,
  esci,
}: {
  nome: string
  ruolo: Ruolo
  corrente: Edizione | null
  esci: () => void
}) {
  const capo = ruolo === 'capo'

  return (
    <main className="flex-1 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] flex flex-col gap-4 max-w-xl w-full mx-auto">
      <div>
        <p className="etichetta">Veneto {new Date().getFullYear()}</p>
        <h1 className="text-[28px] font-semibold leading-tight mt-0.5">Ciao, {nome}</h1>
      </div>

      {corrente ? (
        <section className="plancia p-4 flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-semibold truncate">{corrente.nome}</h2>
            <PillStato stato={corrente.stato} />
          </div>

          {corrente.stato === 'aperta' && (
            <button
              type="button"
              onClick={() => vaiA({ schermo: 'edizione', id: corrente.id, sezione: 'cassa' })}
              className="bottone-forte min-h-[56px] text-[17px]"
            >
              Cassa
            </button>
          )}

          {capo && (
            <button
              type="button"
              onClick={() =>
                vaiA({ schermo: 'edizione', id: corrente.id, sezione: atterraggio(corrente.stato) })
              }
              className="bottone-quieto min-h-[48px]"
            >
              {corrente.stato === 'bozza'
                ? 'Prepara il menu →'
                : corrente.stato === 'aperta'
                  ? 'Andamento →'
                  : 'Consulta →'}
            </button>
          )}

          {!capo && corrente.stato !== 'aperta' && (
            <p className="tenue text-[13px]">
              {corrente.stato === 'bozza'
                ? 'Il capo sta ancora preparando l’edizione.'
                : 'L’edizione è chiusa: si torna al lavoro alla prossima.'}
            </p>
          )}
        </section>
      ) : (
        <section className="plancia p-4">
          <p className="text-[17px] font-semibold">Nessuna edizione</p>
          <p className="tenue text-[13px] mt-1">
            {capo ? 'Creane una in Edizioni.' : 'Il capo non ha ancora creato un’edizione.'}
          </p>
        </section>
      )}

      {capo && (
        <button
          type="button"
          onClick={() => vaiA({ schermo: 'edizioni' })}
          className="plancia p-4 min-h-[96px] flex flex-col justify-end items-start text-left"
        >
          <b className="text-[17px] font-semibold">Edizioni</b>
          <span className="tenue text-[12px]">prepara · apri · chiudi · consulta</span>
        </button>
      )}

      <button
        type="button"
        onClick={esci}
        className="tenue font-semibold min-h-[48px] px-5 self-center mt-2"
      >
        Esci
      </button>
    </main>
  )
}
