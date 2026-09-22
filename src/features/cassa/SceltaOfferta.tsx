import { useState } from 'react'
import { inchiostroPerSmalto } from '../../lib/colori'
import { euro } from '../../lib/money'
import type { Prodotto } from '../../lib/tipi'

/**
 * Toccata un'offerta, la griglia si restringe ai tipi ammessi. Si toccano
 * `pezzi_scelta` voci (anche la stessa più volte) e si conferma; «Senza
 * dettaglio» registra l'offerta generica, per il cliente che non sa ancora.
 */
export function SceltaOfferta({
  offerta,
  menu,
  onConferma,
  onSenzaDettaglio,
  onAnnulla,
}: {
  offerta: Prodotto
  menu: Prodotto[]
  onConferma: (scelti: Prodotto[]) => void
  onSenzaDettaglio: () => void
  onAnnulla: () => void
}) {
  const [scelti, setScelti] = useState<Prodotto[]>([])
  const quanti = offerta.pezzi_scelta ?? 1
  const tipi = offerta.tipi_scelta ?? []
  const candidati = menu.filter((p) => !p.nascosto && p.tipo !== 'offerta' && p.prezzo_cent !== null && tipi.includes(p.tipo))
  const pieno = scelti.length >= quanti

  return (
    <section className="plancia p-3 flex flex-col gap-3" aria-label={`Scegli per ${offerta.nome}`}>
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[16px] font-semibold">{offerta.nome} · {euro(offerta.prezzo_cent ?? 0)}</b>
        <span className="num tenue text-[13px]">{scelti.length}/{quanti}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {candidati.map((p) => {
          const n = scelti.filter((s) => s.id === p.id).length
          return (
            <button key={p.id} type="button" disabled={pieno}
                    onClick={() => setScelti((s) => [...s, p])}
                    className="targa relative p-3 min-h-[72px] flex items-center text-left disabled:opacity-40"
                    style={{ '--tinta': p.colore, '--inchiostro-tinta': inchiostroPerSmalto(p.colore) } as React.CSSProperties}>
              {n > 0 && <span className="contatore num absolute top-2.5 right-2.5 grid place-items-center">{n}</span>}
              <span className="text-[15px] font-semibold leading-tight pr-7">{p.nome}</span>
            </button>
          )
        })}
      </div>

      {scelti.length > 0 && (
        <p className="tenue text-[13px]">
          {scelti.map((s) => s.nome).join(' · ')}
          <button type="button" onClick={() => setScelti((s) => s.slice(0, -1))} className="ml-2 underline">togli ultimo</button>
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onAnnulla} className="bottone-quieto min-h-[56px] px-4">Esci</button>
        <button type="button" onClick={onSenzaDettaglio} className="bottone-quieto min-h-[56px] px-4 flex-1">Senza dettaglio</button>
        <button type="button" disabled={!pieno} onClick={() => onConferma(scelti)}
                className="bottone-forte min-h-[56px] px-4 flex-1 disabled:opacity-40">Conferma</button>
      </div>
    </section>
  )
}
