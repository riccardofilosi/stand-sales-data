import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { messaggioErrore } from '../../lib/errori'
import { euro } from '../../lib/money'
import { classifica, cumulate, perFascia, perFasciaProdotto, riepiloga } from '../../lib/andamento'
import { COLONNE_VENDITA, type Prodotto, type Vendita } from '../../lib/tipi'
import { useSagra } from '../../dati/SagraProvider'
import { Avviso } from '../../guscio/Avviso'
import { Caricamento } from '../../guscio/Caricamento'
import { vaiA } from '../../guscio/sezioni'
import { leggiMenu } from '../listino/datiCatalogo'
import { Esporta } from '../sessione/Esporta'
import { Grafico, type Forma, type Serie } from './Grafico'

const ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })

const FORME: { chiave: Forma; titolo: string }[] = [
  { chiave: 'blocchi', titolo: 'Blocchi' },
  { chiave: 'linea', titolo: 'Linea' },
  { chiave: 'cumulato', titolo: 'Cumulato' },
]

function Riquadro({ titolo, valore, nota, grande = false }: { titolo: string; valore: string; nota?: string; grande?: boolean }) {
  return (
    <div className={`plancia p-4 ${grande ? 'col-span-2' : ''}`}>
      <p className="etichetta">{titolo}</p>
      <p className={`num font-medium leading-tight mt-1 ${grande ? 'text-[38px]' : 'text-[28px]'}`}>{valore}</p>
      {nota && <p className="tenue text-[12px] mt-0.5">{nota}</p>}
    </div>
  )
}

export function Andamento() {
  const { corrente, edizioni } = useSagra()
  const [righe, impostaRighe] = useState<Vendita[]>([])
  const [menu, impostaMenu] = useState<Prodotto[] | null>(null)
  const [errore, impostaErrore] = useState<string | null>(null)
  const [forma, impostaForma] = useState<Forma>('blocchi')
  const [scelti, impostaScelti] = useState<string[]>([])
  const [adesso, impostaAdesso] = useState(() => new Date())

  const rileggi = useCallback(async () => {
    if (!corrente) return
    const { data, error } = await supabase.from('vendite').select(COLONNE_VENDITA).eq('edizione_id', corrente.id)
    if (error) return impostaErrore(messaggioErrore(error))
    impostaErrore(null)
    impostaRighe((data ?? []) as unknown as Vendita[])
    impostaAdesso(new Date())
  }, [corrente])

  useEffect(() => {
    if (!corrente) return
    impostaScelti([])
    void rileggi()
    leggiMenu(corrente.id).then(impostaMenu).catch(() => {})
    const canale = supabase
      .channel(`vendite-${corrente.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vendite' }, () => void rileggi())
      .subscribe()
    const battito = window.setInterval(() => impostaAdesso(new Date()), 60_000)
    return () => { void supabase.removeChannel(canale); window.clearInterval(battito) }
  }, [corrente, rileggi])

  // A edizione chiusa le fasce finiscono alla chiusura, non a «adesso».
  const fine = useMemo(
    () => (corrente?.stato === 'chiusa' && corrente.chiusa_il ? new Date(corrente.chiusa_il) : adesso),
    [corrente, adesso],
  )
  const fasce = useMemo(() => perFascia(righe, corrente?.aperta_il ?? null, fine), [righe, corrente, fine])
  const voci = useMemo(() => (menu ? classifica(righe, menu) : []), [righe, menu])
  const serie: Serie[] = useMemo(() => {
    if (!menu || scelti.length === 0) return []
    const perId = perFasciaProdotto(righe, scelti, corrente?.aperta_il ?? null, fine)
    return scelti.map((id) => ({ id, colore: menu.find((p) => p.id === id)?.colore ?? '#4A6670', valori: perId.get(id) ?? [] }))
  }, [menu, scelti, righe, corrente, fine])

  if (!corrente) return <p className="plancia p-5 mt-4 tenue">Nessuna edizione.</p>
  if (errore) return <div className="mt-4"><Avviso>{errore}</Avviso></div>
  if (!menu) return <Caricamento />

  const { pezzi, incassoCent, ordini } = riepiloga(righe)
  const iCorrente = fasce.length - 1
  const valore = fasce[iCorrente]?.pezzi ?? 0
  const precedente = fasce[iCorrente - 1]?.pezzi ?? 0
  const totaleCumulato = cumulate(fasce).at(-1) ?? 0
  const variazione = precedente > 0 ? Math.round(((valore - precedente) / precedente) * 100) : 0
  const inCalo = variazione < 0
  const qmax = Math.max(...voci.map((v) => v.pezzi + v.stimati), 1)
  const alterna = (id: string) => impostaScelti((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const altre = edizioni.filter((e) => e.stato !== 'bozza')

  return (
    <div className="flex flex-col gap-2.5 pt-4">
      {altre.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="etichetta">Anno</span>
          <select value={corrente.id} onChange={(e) => vaiA({ schermo: 'edizione', id: e.target.value, sezione: 'andamento' })}
                  className="campo min-h-[44px] px-3 flex-1">
            {altre.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Riquadro grande titolo="Incasso" valore={euro(incassoCent)} nota={corrente.stato === 'chiusa' ? 'edizione chiusa' : 'dall’apertura'} />
        <Riquadro titolo="Pezzi" valore={String(pezzi)} />
        <Riquadro titolo="Ordini" valore={String(ordini)} />
        <Riquadro grande titolo="Aggiornato" valore={ORA.format(adesso)} />
      </div>

      <div className="plancia p-4">
        <div className="flex items-center justify-between gap-2.5 flex-wrap mb-3">
          <b className="etichetta">{serie.length ? 'Per prodotto, ogni mezz’ora' : forma === 'cumulato' ? 'Progressivo' : 'Per mezz’ora'}</b>
          {serie.length === 0 && (
            <div role="group" aria-label="Forma del grafico" className="flex gap-0.5 p-0.5 rounded-full shrink-0" style={{ background: 'var(--surf2)' }}>
              {FORME.map((f) => (
                <button key={f.chiave} type="button" aria-pressed={forma === f.chiave} onClick={() => impostaForma(f.chiave)}
                        className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold aria-pressed:bg-[var(--act-bg)] aria-pressed:text-[var(--act-ink)] tenue aria-pressed:opacity-100">
                  {f.titolo}
                </button>
              ))}
            </div>
          )}
        </div>

        {serie.length === 0 && (
          <div className="flex items-baseline gap-3 flex-wrap mb-3">
            <span className="num text-[32px] font-medium leading-none">{forma === 'cumulato' ? totaleCumulato : valore}</span>
            <span className="tenue text-[12px]">{forma === 'cumulato' ? 'pezzi dall’apertura' : 'pezzi nella fascia in corso'}</span>
            {forma !== 'cumulato' && precedente > 0 && (
              <span className="num text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--surf2)', color: inCalo ? 'var(--rosso)' : '#52D5BA' }}>
                {inCalo ? '▼' : '▲'} {Math.abs(variazione)}% {inCalo ? 'in calo' : 'in salita'}
              </span>
            )}
          </div>
        )}

        <Grafico fasce={fasce} forma={forma} serie={serie} />
        {serie.length > 0 && <p className="tenue text-[11px] mt-2.5">tocca le voci qui sotto per aggiungere o togliere una linea</p>}
      </div>

      <div className="plancia p-4">
        <div className="flex items-center justify-between gap-2.5 mb-1">
          <b className="text-[14.5px] font-semibold">Per voce</b>
          {scelti.length > 0 && <button type="button" onClick={() => impostaScelti([])} className="tenue text-[12px] underline">tutte</button>}
        </div>
        <p className="tenue text-[11.5px] mb-3">tocca una voce per vederne l’andamento orario</p>
        {voci.length === 0 && <p className="tenue text-[13px]">Ancora niente.</p>}
        {voci.map((v) => {
          const attiva = scelti.includes(v.chiave)
          return (
            <button key={v.chiave} type="button" aria-pressed={attiva} onClick={() => alterna(v.chiave)}
                    className="w-full flex items-center gap-3 py-2.5 text-left" style={{ borderTop: '1px solid var(--line)', opacity: scelti.length && !attiva ? 0.5 : 1 }}>
              <i aria-hidden="true" className="w-[26px] h-[26px] rounded-[8px] shrink-0" style={{ background: v.colore, outline: attiva ? '2px solid var(--ink)' : undefined }} />
              <div className="flex-1 min-w-0">
                <b className="block text-[13.5px] font-medium truncate">{v.nome}</b>
                <span aria-hidden="true" className="block h-1 rounded-sm mt-1.5 opacity-55" style={{ background: v.colore, width: `${Math.round(((v.pezzi + v.stimati) / qmax) * 100)}%` }} />
              </div>
              <div className="text-right shrink-0">
                <b className="num block text-[14px] font-semibold">{v.pezzi}{v.stimati > 0 && <span className="tenue font-normal"> +{v.stimati} stimati</span>}</b>
                <span className="num tenue block text-[11px]">{euro(v.incassoCent)}</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="plancia p-4">
        <Esporta edizione={corrente} />
      </div>
    </div>
  )
}
