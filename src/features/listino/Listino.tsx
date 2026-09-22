import { useCallback, useEffect, useState } from 'react'
import { useSagra } from '../../dati/SagraProvider'
import { Avviso } from '../../guscio/Avviso'
import { Caricamento } from '../../guscio/Caricamento'
import { CampoInline } from '../../guscio/CampoInline'
import { centDaTesto, testoDaCent } from '../../lib/money'
import type { Prodotto } from '../../lib/tipi'
import { nuovoOrdine } from './albero'
import { NuovoProdotto } from './NuovoProdotto'
import { SceltaColore } from './SceltaColore'
import * as dati from './datiCatalogo'
import { apriEdizione } from '../sessione/datiSessione'

type Esegui = (azione: () => Promise<unknown>) => void

const TIPO: Record<Prodotto['tipo'], string> = { cibo: 'cibo', bevanda: 'bevanda', offerta: 'offerta' }

function Riga({ p, indice, tutte, esegui }: { p: Prodotto; indice: number; tutte: Prodotto[]; esegui: Esegui }) {
  const [scelgo, setScelgo] = useState(false)
  const sposta = (verso: -1 | 1) => {
    const cambiate = nuovoOrdine(tutte, indice, verso)
    if (cambiate.length) esegui(() => dati.riscriviOrdine(cambiate))
  }
  const dettaglioOfferta =
    p.tipo === 'offerta' && p.pezzi_scelta
      ? `${p.pezzi_scelta} a scelta fra ${(p.tipi_scelta ?? []).map((t) => (t === 'cibo' ? 'cibi' : 'bevande')).join(' e ')}`
      : null

  return (
    <li className="py-2" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={`Colore di ${p.nome}`} aria-expanded={scelgo}
                onClick={() => setScelgo((s) => !s)} className="targa w-8 h-8 min-h-0 shrink-0"
                style={{ background: p.colore }} />
        <div className="flex-1 min-w-[8rem]">
          <CampoInline valore={p.nome} etichetta="Nome" onSalva={(nome) => esegui(() => dati.aggiorna(p.id, { nome }))}
                       classe={`w-full ${p.nascosto ? 'line-through tenue' : ''}`} />
          <span className="tenue text-[11.5px] pl-2">{TIPO[p.tipo]}{dettaglioOfferta ? ` · ${dettaglioOfferta}` : ''}</span>
        </div>
        <CampoInline valore={testoDaCent(p.prezzo_cent)} etichetta={`Prezzo di ${p.nome}`} tastiera="decimal"
                     onSalva={(testo) => {
                       const cent = centDaTesto(testo)
                       if (testo.trim() === '') esegui(() => dati.aggiorna(p.id, { prezzo_cent: null }))
                       else if (cent !== null) esegui(() => dati.aggiorna(p.id, { prezzo_cent: cent }))
                     }}
                     classe="cartiglio w-24 text-right" />
        {p.nascosto ? (
          <button type="button" onClick={() => esegui(() => dati.aggiorna(p.id, { nascosto: false }))}
                  className="bottone-quieto min-h-[48px] px-3 text-[13px]">Rimetti</button>
        ) : (
          <button type="button" aria-label={`Elimina ${p.nome}`}
                  onClick={() => esegui(async () => {
                    try {
                      await dati.elimina(p.id)
                    } catch {
                      await dati.aggiorna(p.id, { nascosto: true })
                      throw new Error(`«${p.nome}» è già stata venduta: non si elimina, ma l’ho tolta dalla cassa.`)
                    }
                  })}
                  className="bottone-quieto w-12 min-h-[48px]">×</button>
        )}
        <span className="flex gap-1">
          <button type="button" aria-label="Sposta su" disabled={indice === 0} onClick={() => sposta(-1)}
                  className="bottone-quieto w-12 min-h-[48px] disabled:opacity-30">↑</button>
          <button type="button" aria-label="Sposta giù" disabled={indice === tutte.length - 1} onClick={() => sposta(1)}
                  className="bottone-quieto w-12 min-h-[48px] disabled:opacity-30">↓</button>
        </span>
      </div>
      {scelgo && (
        <div className="mt-2">
          <SceltaColore valore={p.colore} onScegli={(colore) => { setScelgo(false); esegui(() => dati.aggiorna(p.id, { colore })) }} />
        </div>
      )}
    </li>
  )
}

/** Il menu dell'edizione: lista unica. Si usa da seduti, giorni prima. */
export function Listino() {
  const { corrente, caricamento, ricarica: ricaricaSagra } = useSagra()
  const [voci, setVoci] = useState<Prodotto[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const edizioneId = corrente?.id ?? null
  const ricarica = useCallback(async () => {
    if (!edizioneId) return setVoci([])
    try {
      setVoci(await dati.leggiMenu(edizioneId))
      setErrore(null)
    } catch (e) {
      setErrore((e as Error).message)
    }
  }, [edizioneId])

  useEffect(() => { void ricarica() }, [ricarica])

  const esegui: Esegui = useCallback((azione) => {
    setInCorso(true)
    azione()
      .then(() => null, (e: Error) => e.message)
      .then(async (msg) => {
        await ricarica()
        setErrore(msg)
        setInCorso(false)
      })
  }, [ricarica])

  if (caricamento) return <Caricamento />
  if (!corrente) {
    return (
      <div className="plancia p-5 mt-4">
        <p className="text-[19px] font-semibold">Nessuna edizione</p>
        <p className="tenue mt-2 text-[14px]">Creane una in Edizioni: il menu appartiene all’edizione.</p>
      </div>
    )
  }
  if (!errore && !voci) return <Caricamento testo="Lettura…" />
  const lista = voci ?? []
  const pronte = lista.filter((p) => !p.nascosto && p.prezzo_cent !== null).length

  return (
    <div className="pt-4 flex flex-col gap-3 max-w-3xl">
      {errore && <Avviso>{errore}</Avviso>}
      {corrente.stato === 'chiusa' && (
        <p className="plancia p-3.5 tenue text-[13px]">Edizione chiusa: il menu si corregge, le vendite registrate non cambiano.</p>
      )}
      <div aria-live="polite" className="sr-only">{inCorso ? 'Salvataggio in corso' : ''}</div>

      <ul className="plancia px-3">
        {lista.length === 0 && <li className="tenue text-[13.5px] py-4">Menu vuoto. Aggiungi le voci qui sotto.</li>}
        {lista.map((p, i) => <Riga key={p.id} p={p} indice={i} tutte={lista} esegui={esegui} />)}
      </ul>

      <NuovoProdotto edizioneId={corrente.id} quante={lista.length} onAggiungi={(voce) => esegui(() => dati.aggiungiVoce(voce))} />

      {corrente.stato === 'bozza' && (
        <button type="button" disabled={pronte === 0}
                onClick={() => esegui(async () => { await apriEdizione(corrente.id); await ricaricaSagra() })}
                className="bottone-forte min-h-[56px] px-4 mt-2 disabled:opacity-40">
          Apri la cassa ({pronte} voci)
        </button>
      )}
    </div>
  )
}
