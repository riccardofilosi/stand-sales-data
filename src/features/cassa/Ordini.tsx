import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSessione } from '../../auth/SessionProvider'
import { messaggioErrore } from '../../lib/errori'
import { euro } from '../../lib/money'
import { nuovoId } from '../../lib/ordine'
import { ordiniRegistrati, type OrdineRegistrato } from '../../lib/andamento'
import { COLONNE_VENDITA, type Prodotto, type Vendita } from '../../lib/tipi'
import { Avviso } from '../../guscio/Avviso'
import { useCoda } from './CodaProvider'

const ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })

/**
 * Gli ordini già registrati da questa persona. Non si cancella: si aggiunge
 * una riga opposta. Un gesto (offerta + componenti) si annulla intero.
 * La lista legge dal database: un ordine in coda senza rete compare appena
 * consegnato, e la coda avvisa quando consegna o respinge.
 */
export function Ordini({ edizioneId, menu, giro }: { edizioneId: string; menu: Prodotto[]; giro: number }) {
  const { coda } = useCoda()
  const utenteId = useSessione().session?.user.id
  const [ordini, impostaOrdini] = useState<OrdineRegistrato[]>([])
  const [errore, impostaErrore] = useState<string | null>(null)
  const [aperto, impostaAperto] = useState(false)
  const [armato, impostaArmato] = useState<string | null>(null)

  const rileggi = useCallback(async () => {
    if (!utenteId) return
    const { data, error } = await supabase
      .from('vendite').select(COLONNE_VENDITA)
      .eq('edizione_id', edizioneId).eq('operatore_id', utenteId)
      .order('registrato_il', { ascending: false }).limit(200)
    if (error) return impostaErrore(messaggioErrore(error))
    impostaErrore(null)
    impostaOrdini(ordiniRegistrati((data ?? []) as unknown as Vendita[], menu))
  }, [edizioneId, menu, utenteId])

  useEffect(() => { void rileggi() }, [rileggi, giro])

  useEffect(() => {
    const stacca = coda.sottoscrivi(() => void rileggi())
    return stacca
  }, [coda, rileggi])

  useEffect(() => {
    if (!armato) return
    const t = window.setTimeout(() => impostaArmato(null), 4000)
    return () => window.clearTimeout(t)
  }, [armato])

  const storna = (ids: string[]) => {
    if (ids.length === 0) return
    const righe = ids.map((storna_id) => ({ id: nuovoId(), storna_id, registrato_il: new Date().toISOString() }))
    coda.accoda(righe[0].id, 'storna_vendite', { p_righe: righe })
    void coda.svuota().then(rileggi)
    void rileggi()
  }

  const armaOppureEsegui = (chiave: string, ids: string[]) => {
    if (armato !== chiave) return impostaArmato(chiave)
    impostaArmato(null)
    storna(ids)
  }

  if (ordini.length === 0 && !errore) return null

  return (
    <details className="plancia overflow-hidden" open={aperto}
             onToggle={(e) => impostaAperto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="px-4 min-h-[52px] flex items-center gap-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <b className="flex-1 text-[14.5px] font-semibold">Ordini già registrati</b>
        <span className="tenue text-[12px]">per correggere</span>
      </summary>
      {errore && <div className="px-4 pb-3"><Avviso nudo>{errore}</Avviso></div>}

      {ordini.map((o) => {
        const tutti = o.gesti.flatMap((g) => g.idAnnullabili)
        const chiaveTutto = `${o.ordineId}|tutto`
        return (
          <div key={o.ordineId} className="px-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="flex-1 min-w-0 tenue text-[13px] num">
                <b className="text-[14px] font-semibold mr-2" style={{ color: 'var(--ink)' }}>{ORA.format(new Date(o.ora))}</b>
                {o.lordoCent !== o.nettoCent && <s className="opacity-55 mr-1.5">{euro(o.lordoCent)}</s>}
                {euro(o.nettoCent)}
              </span>
              <button type="button" disabled={tutti.length === 0} onClick={() => armaOppureEsegui(chiaveTutto, tutti)}
                      className={`min-h-[36px] px-3 text-[11.5px] rounded-[10px] font-semibold shrink-0 ${armato === chiaveTutto ? 'bottone-armato' : 'bottone-quieto'}`}>
                {armato === chiaveTutto ? 'Sicuro?' : 'Annulla tutto'}
              </button>
            </div>
            {o.gesti.map((g) => {
              const chiave = `${o.ordineId}|${g.gestoId}`
              return (
                <div key={g.gestoId} className="flex items-center gap-2.5 py-1.5" style={g.stornato ? { color: 'var(--rosso)' } : undefined}>
                  <i aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: g.colore }} />
                  <span className="flex-1 min-w-0 text-[13.5px] truncate">
                    {g.stornato ? 'annullato · ' : ''}{g.nome}
                    {g.dettaglio && <span className="tenue block text-[11.5px] truncate">{g.dettaglio}</span>}
                  </span>
                  <span className="num text-[13.5px] font-semibold shrink-0 min-w-[62px] text-right">{euro(g.prezzoCent)}</span>
                  <button type="button" disabled={g.idAnnullabili.length === 0} onClick={() => armaOppureEsegui(chiave, g.idAnnullabili)}
                          className={`min-h-[36px] px-2.5 text-[12px] rounded-[10px] font-semibold shrink-0 ${armato === chiave ? 'bottone-armato' : 'bottone-quieto'}`}>
                    {armato === chiave ? 'Sicuro?' : 'Annulla'}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </details>
  )
}
