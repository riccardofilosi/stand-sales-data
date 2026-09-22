import { useEffect, useMemo, useState } from 'react'
import { useSagra } from '../../dati/SagraProvider'
import { Avviso } from '../../guscio/Avviso'
import { Caricamento } from '../../guscio/Caricamento'
import { inchiostroPerSmalto } from '../../lib/colori'
import { euro } from '../../lib/money'
import {
  aggiungi, aggiungiOfferta, nuovoId, perIlServer, quantiDi, raggruppa, togliGesto, togliUno, totaleCent,
  type Pezzo,
} from '../../lib/ordine'
import type { Prodotto } from '../../lib/tipi'
import { leggiMenu } from '../listino/datiCatalogo'
import { useCoda } from './CodaProvider'
import { useSospeso } from './SospesoContext'
import { SceltaOfferta } from './SceltaOfferta'
import { Ordini } from './Ordini'

const SEZIONI: { tipo: Prodotto['tipo']; titolo: string }[] = [
  { tipo: 'bevanda', titolo: 'Bevande' },
  { tipo: 'cibo', titolo: 'Cibo' },
  { tipo: 'offerta', titolo: 'Offerte' },
]

export function Cassa() {
  const { corrente } = useSagra()
  const { coda, inAttesa, respinte } = useCoda()
  const { impostaSospeso } = useSospeso()

  const [menu, impostaMenu] = useState<Prodotto[] | null>(null)
  const [errore, impostaErrore] = useState<string | null>(null)
  const [pezzi, impostaPezzi] = useState<Pezzo[]>([])
  const [offertaAperta, impostaOffertaAperta] = useState<Prodotto | null>(null)
  const [giro, impostaGiro] = useState(0)

  useEffect(() => { impostaSospeso(pezzi.length > 0) }, [pezzi, impostaSospeso])
  useEffect(() => () => impostaSospeso(false), [impostaSospeso])

  useEffect(() => {
    if (!corrente) return
    let vivo = true
    leggiMenu(corrente.id)
      .then((m) => { if (vivo) { impostaMenu(m); impostaErrore(null) } })
      .catch((e: Error) => vivo && impostaErrore(e.message))
    return () => { vivo = false }
  }, [corrente])

  const visibili = useMemo(() => (menu ?? []).filter((p) => !p.nascosto), [menu])

  if (!corrente || corrente.stato !== 'aperta') {
    return <p className="plancia p-5 mt-4 tenue">Nessuna edizione aperta. La cassa registra solo a edizione aperta.</p>
  }
  if (errore && !menu) return <div className="mt-4"><Avviso>{errore}</Avviso></div>
  if (!menu) return <Caricamento testo="Lettura del menu…" />
  if (visibili.length === 0) return <p className="plancia p-5 mt-4 tenue">Il menu è vuoto. Si riempie in Menu.</p>

  const blocchi = raggruppa(pezzi)
  const totale = totaleCent(pezzi)
  const ora = () => new Date().toISOString()

  const tocca = (p: Prodotto) => {
    impostaErrore(null)
    if (p.tipo === 'offerta') impostaOffertaAperta(p)
    else impostaPezzi((d) => aggiungi(d, p, ora()))
  }

  const registra = () => {
    if (pezzi.length === 0) return
    const ordineId = nuovoId()
    // L'id della busta è quello del primo pezzo: rinviare lo stesso lotto non lo raddoppia.
    coda.accoda(pezzi[0].id, 'registra_vendite', { p_righe: perIlServer(pezzi, ordineId) })
    // Il giro scatta a consegna avvenuta: la lista sotto rilegge quando il server ha l'ordine.
    void coda.svuota().then(() => impostaGiro((n) => n + 1))
    impostaPezzi([])
    impostaErrore(null)
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="etichetta" id="etichetta-totale">Totale</span>
        <span role="status" aria-labelledby="etichetta-totale" className="num text-[44px] font-medium leading-none">{euro(totale)}</span>
      </div>

      {offertaAperta ? (
        <SceltaOfferta
          offerta={offertaAperta}
          menu={visibili}
          onConferma={(scelti) => { impostaPezzi((d) => aggiungiOfferta(d, offertaAperta, scelti, ora())); impostaOffertaAperta(null) }}
          onSenzaDettaglio={() => { impostaPezzi((d) => aggiungiOfferta(d, offertaAperta, [], ora())); impostaOffertaAperta(null) }}
          onAnnulla={() => impostaOffertaAperta(null)}
        />
      ) : (
        SEZIONI.map((s) => {
          const voci = visibili.filter((p) => p.tipo === s.tipo)
          if (voci.length === 0) return null
          return (
            <section key={s.tipo} aria-label={s.titolo}>
              <h2 className="etichetta mb-2">{s.titolo}</h2>
              <div className="grid grid-cols-2 gap-2">
                {voci.map((p) => {
                  const quanti = quantiDi(pezzi, p.id)
                  return (
                    <button key={p.id} type="button" disabled={p.prezzo_cent === null} onClick={() => tocca(p)}
                            className="targa relative p-3 flex flex-col justify-between text-left"
                            style={{ '--tinta': p.colore, '--inchiostro-tinta': inchiostroPerSmalto(p.colore) } as React.CSSProperties}>
                      {quanti > 0 && <span className="contatore num absolute top-2.5 right-2.5 grid place-items-center">{quanti}</span>}
                      <span className="text-[15px] font-semibold leading-tight pr-7">{p.nome}</span>
                      <span className="cartiglio num self-start text-[12.5px]">{euro(p.prezzo_cent ?? 0)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })
      )}

      {errore && <Avviso>{errore}</Avviso>}
      {inAttesa > 0 && <p className="tenue text-[13px] num">{inAttesa} ordini in attesa di rete</p>}
      {respinte.length > 0 && (
        <Avviso>{respinte.length} ordini respinti dal server: {respinte[0].errore}. Non sono stati registrati.</Avviso>
      )}

      <section className="plancia overflow-hidden" aria-label="Ordine in corso">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
          <b className="text-[14.5px] font-semibold">Ordine in corso</b>
          <span className="tenue text-[12px] num">{pezzi.filter((p) => !p.dentroOfferta).length} voci</span>
        </div>
        <ul className="px-4 flex flex-col">
          {blocchi.length === 0 && <li className="tenue text-[13.5px] pb-4 pt-1">Nessuna voce. Tocca il menu qui sopra.</li>}
          {blocchi.map((b) =>
            b.tipo === 'prodotto' ? (
              <li key={b.prodottoId} className="py-3 flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="flex items-center gap-3">
                  <i aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: b.colore }} />
                  <span className="flex-1 min-w-0 text-[14.5px] font-medium">{b.nome}</span>
                  <span className="num text-[15px] font-semibold">{euro(b.totaleCent)}</span>
                </div>
                <div className="flex items-center gap-2.5 pl-[22px]">
                  <div className="passo flex items-center gap-0.5">
                    <button type="button" aria-label={`Uno in meno di ${b.nome}`} onClick={() => impostaPezzi((d) => togliUno(d, b.prodottoId))}>−</button>
                    <span className="num min-w-[34px] text-center text-[16px] font-semibold">{b.quantita}</span>
                    <button type="button" aria-label={`Uno in più di ${b.nome}`}
                            onClick={() => { const p = visibili.find((x) => x.id === b.prodottoId); if (p) tocca(p) }}>+</button>
                  </div>
                  <span className="tenue num text-[11.5px]">{euro(b.listinoCent)} l’uno</span>
                </div>
              </li>
            ) : (
              <li key={b.gestoId} className="py-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--line)' }}>
                <i aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: b.colore }} />
                <span className="flex-1 min-w-0 text-[14.5px] font-medium">
                  {b.nome}
                  <span className="tenue block text-[11.5px] font-normal truncate">{b.componenti.length ? b.componenti.join(' · ') : 'senza dettaglio'}</span>
                </span>
                <span className="num text-[15px] font-semibold">{euro(b.totaleCent)}</span>
                <button type="button" aria-label={`Togli ${b.nome}`} onClick={() => impostaPezzi((d) => togliGesto(d, b.gestoId))}
                        className="bottone-quieto w-11 min-h-[44px]">×</button>
              </li>
            ),
          )}
        </ul>
        <div className="p-3.5 pt-3">
          <button type="button" disabled={pezzi.length === 0} onClick={registra}
                  className="bottone-forte w-full min-h-[96px] text-[18px] flex items-center justify-center gap-3">
            Registra ordine <span className="num text-[16px] font-medium opacity-85">{euro(totale)}</span>
          </button>
        </div>
      </section>

      <Ordini edizioneId={corrente.id} menu={menu} giro={giro} />
    </div>
  )
}
