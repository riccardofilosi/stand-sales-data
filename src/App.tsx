import { useEffect } from 'react'
import { SessionProvider, useSessione } from './auth/SessionProvider'
import { Login } from './auth/Login'
import { SagraProvider, useSagra } from './dati/SagraProvider'
import { Caricamento } from './guscio/Caricamento'
import { Corpo, Pastiglie, PillStato, Schermo, Testata } from './guscio/Guscio'
import { Hub } from './guscio/Hub'
import {
  atterraggio,
  puoVedere,
  sezioniEdizione,
  useRottaUrl,
  vaiA,
  type Rotta,
} from './guscio/sezioni'
import { CodaProvider } from './features/cassa/CodaProvider'
import { SospesoProvider, useSospeso } from './features/cassa/SospesoContext'
import { Cassa } from './features/cassa/Cassa'
import { Andamento } from './features/andamento/Andamento'
import { Listino } from './features/listino/Listino'
import { Sessione } from './features/sessione/Sessione'

const HUB: Rotta = { schermo: 'hub' }

function Edizione({ rotta }: { rotta: Extract<Rotta, { schermo: 'edizione' }> }) {
  const { profilo } = useSessione()
  const { edizioni, caricamento } = useSagra()
  const { sospeso } = useSospeso()

  const edizione = edizioni.find((e) => e.id === rotta.id) ?? null
  const capo = profilo?.role === 'capo'

  useEffect(() => {
    if (caricamento) return
    if (!edizione) {
      vaiA(HUB)
      return
    }
    const voce = sezioniEdizione(edizione.stato).find((v) => v.chiave === rotta.sezione)
    if (!voce?.attiva) {
      vaiA({ schermo: 'edizione', id: edizione.id, sezione: atterraggio(edizione.stato) })
    }
  }, [caricamento, edizione, rotta.sezione])

  if (!edizione) return <Caricamento testo="Lettura…" schermoIntero />

  const inCassa = rotta.sezione === 'cassa'

  return (
    <Schermo>
      <Testata
        titolo={inCassa ? 'Cassa' : edizione.nome}
        onIndietro={() => vaiA(capo ? { schermo: 'edizioni' } : HUB)}
        costaUscire={inCassa && sospeso}
        destra={inCassa ? undefined : <PillStato stato={edizione.stato} />}
      />
      {!inCassa && capo && (
        <Pastiglie
          stato={edizione.stato}
          sezione={rotta.sezione}
          vaiA={(s) => vaiA({ schermo: 'edizione', id: edizione.id, sezione: s })}
        />
      )}
      <Corpo>
        {rotta.sezione === 'cassa' && <Cassa />}
        {rotta.sezione === 'andamento' && <Andamento />}
        {rotta.sezione === 'listino' && <Listino />}
      </Corpo>
    </Schermo>
  )
}

function Applicazione() {
  const { profilo, esci } = useSessione()
  const { corrente, scegli, caricamento } = useSagra()
  const rotta = useRottaUrl() ?? HUB

  const edizioneId = rotta.schermo === 'edizione' ? rotta.id : null
  useEffect(() => {
    scegli(edizioneId)
  }, [edizioneId, scegli])

  useEffect(() => {
    if (!window.location.hash) window.location.hash = '#hub'
  }, [])

  const ammessa = puoVedere(profilo?.role ?? null, rotta)
  useEffect(() => {
    if (profilo && !ammessa) vaiA(HUB)
  }, [profilo, ammessa])

  if (caricamento && !corrente) return <Caricamento testo="Lettura…" schermoIntero />
  if (!profilo) return <Caricamento testo="Lettura…" schermoIntero />
  if (!ammessa) return <Caricamento schermoIntero />

  if (rotta.schermo === 'edizione') return <Edizione rotta={rotta} />

  if (rotta.schermo === 'edizioni') {
    return (
      <Schermo>
        <Testata titolo="Edizioni" onIndietro={() => vaiA(HUB)} />
        <Corpo>
          <Sessione />
        </Corpo>
      </Schermo>
    )
  }

  return (
    <Schermo>
      <Hub nome={profilo.nome} ruolo={profilo.role} corrente={corrente} esci={() => void esci()} />
    </Schermo>
  )
}

function Contenuto() {
  const { session, profilo, profiloAssente, esci, caricamento } = useSessione()
  if (caricamento) return <Caricamento testo="Apertura…" schermoIntero />
  if (!session) return <Login />
  // Riga mancante in `profiles` (cancellata a mano): senza questa guardia
  // si resterebbe su «Lettura…» per sempre.
  if (profiloAssente && !profilo) {
    return (
      <Schermo>
        <main className="flex-1 grid place-items-center p-6">
          <div className="plancia p-5 max-w-sm flex flex-col gap-3">
            <p className="text-[19px] font-semibold">Account incompleto</p>
            <p className="tenue text-[14px]">
              L’account {session.user.email ?? ''} esiste ma non ha un profilo. Chiedi al capo.
            </p>
            <button type="button" onClick={() => void esci()} className="bottone-quieto min-h-[48px]">
              Esci
            </button>
          </div>
        </main>
      </Schermo>
    )
  }
  return (
    <SagraProvider>
      <SospesoProvider>
        <CodaProvider>
          <Applicazione />
        </CodaProvider>
      </SospesoProvider>
    </SagraProvider>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <Contenuto />
    </SessionProvider>
  )
}
