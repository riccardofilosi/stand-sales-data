import { useState } from 'react'
import { useSagra } from '../../dati/SagraProvider'
import { Avviso } from '../../guscio/Avviso'
import { Caricamento } from '../../guscio/Caricamento'
import { atterraggio, vaiA } from '../../guscio/sezioni'
import { BottoneArmato } from '../../guscio/BottoneArmato'
import type { Edizione } from '../../lib/tipi'
import {
  apriEdizione,
  chiudiEdizione,
  copiaMenu,
  creaEdizione,
  eliminaBozza,
} from './datiSessione'

function Riga({
  edizione,
  altre,
  esegui,
}: {
  edizione: Edizione
  altre: Edizione[]
  esegui: (azione: () => Promise<unknown>) => void
}) {
  const [da, setDa] = useState('')

  return (
    <div className="plancia p-4 mb-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[22px] font-semibold">{edizione.nome}</p>
          <p className="num tenue text-[13px]">
            {edizione.stato === 'bozza' ? 'in preparazione' : edizione.stato}
            {edizione.aperta_il &&
              ` · aperta il ${new Date(edizione.aperta_il).toLocaleString('it-IT')}`}
            {edizione.chiusa_il &&
              ` · chiusa il ${new Date(edizione.chiusa_il).toLocaleString('it-IT')}`}
          </p>
        </div>

        {edizione.stato === 'aperta' ? (
          <BottoneArmato
            riposo="Chiudi"
            conferma="Tocca di nuovo per chiudere"
            onConferma={() => esegui(chiudiEdizione)}
          />
        ) : (
          <>
            {/* Via con tutto il suo menu (le chiavi hanno la cascata), ma
                solo le bozze: un'edizione che e' stata aperta e' storia, e
                per quelle con vendite l'ultimo no lo dice il database. */}
            {edizione.stato === 'bozza' && (
              <BottoneArmato
                riposo="Elimina"
                conferma="Tocca di nuovo: via anche il suo menu"
                onConferma={() => esegui(() => eliminaBozza(edizione.id))}
              />
            )}
            <button
              type="button"
              onClick={() => esegui(() => apriEdizione(edizione.id))}
              className="bottone-forte min-h-[48px] px-4"
            >
              {/* Riaprire è previsto (decisione 22), per il blocchetto che salta
                  fuori il giorno dopo. */}
              {edizione.stato === 'chiusa' ? 'Riapri' : 'Apri'}
            </button>
          </>
        )}
      </div>

      {/* La porta delle sezioni: dentro l'edizione si lavora, qui la si
          amministra. Una bozza si prepara, il resto si legge. */}
      <button
        type="button"
        onClick={() =>
          vaiA({ schermo: 'edizione', id: edizione.id, sezione: atterraggio(edizione.stato) })
        }
        className="bottone-quieto min-h-[48px] w-full mt-3"
      >
        {edizione.stato === 'bozza'
          ? 'Prepara il menu →'
          : edizione.stato === 'aperta'
            ? 'Entra →'
            : 'Consulta →'}
      </button>

      {edizione.stato === 'bozza' && altre.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          <label className="sr-only" htmlFor={`da-${edizione.id}`}>
            Edizione da cui copiare il menu
          </label>
          <select
            id={`da-${edizione.id}`}
            value={da}
            onChange={(e) => setDa(e.target.value)}
            className="campo flex-1 min-w-[10rem] min-h-[48px] px-3"
          >
            <option value="">Copia il menu da…</option>
            {altre.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!da}
            onClick={() => esegui(() => copiaMenu(da, edizione.id))}
            className="bottone-quieto min-h-[48px] px-4 disabled:opacity-40"
          >
            Copia
          </button>
        </div>
      )}
    </div>
  )
}

export function Sessione() {
  const { edizioni, caricamento, ricarica } = useSagra()
  const [errore, setErrore] = useState<string | null>(null)
  const [anno, setAnno] = useState('')
  const [nome, setNome] = useState('')

  const esegui = (azione: () => Promise<unknown>) => {
    azione()
      .then(() => setErrore(null))
      .catch((e: Error) => setErrore(e.message))
      .finally(() => void ricarica())
  }

  if (caricamento) return <Caricamento testo="Lettura…" />

  return (
    <div className="max-w-2xl pt-4">
      {errore && (
        <div className="mb-4">
          <Avviso>{errore}</Avviso>
        </div>
      )}

      {edizioni.map((e) => (
        <Riga key={e.id} edizione={e} altre={edizioni.filter((a) => a.id !== e.id)} esegui={esegui} />
      ))}

      <form
        className="plancia p-4 flex flex-wrap gap-2"
        onSubmit={(ev) => {
          ev.preventDefault()
          const n = Number(anno.trim())
          const titolo = nome.trim() || `Sagra ${n}`
          if (!Number.isInteger(n) || n < 2000 || n > 2100) {
            setErrore('L’anno va scritto per intero, per esempio 2027.')
            return
          }
          esegui(async () => {
            await creaEdizione(n, titolo)
            setAnno('')
            setNome('')
          })
        }}
      >
        {/* Etichette in vista: «2027» e «Sagra 2027» da soli non dicevano
            quale fosse l'anno e quale il nome. */}
        <label className="w-28 flex flex-col gap-1">
          <span className="tenue text-[13px]">Anno</span>
          <input
            placeholder="2027"
            inputMode="numeric"
            value={anno}
            onChange={(e) => setAnno(e.target.value)}
            className="campo min-h-[48px] px-3"
          />
        </label>
        <label className="flex-1 min-w-[10rem] flex flex-col gap-1">
          <span className="tenue text-[13px]">Nome (se vuoto: «Sagra {anno.trim() || 'anno'}»)</span>
          <input
            placeholder="Sagra 2027"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo min-h-[48px] px-3"
          />
        </label>
        <button type="submit" className="bottone-quieto min-h-[48px] px-4 self-end">
          Crea edizione
        </button>
      </form>
    </div>
  )
}
