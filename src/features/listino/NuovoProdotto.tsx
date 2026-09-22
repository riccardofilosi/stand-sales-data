import { useState } from 'react'
import { TINTE, inchiostroPerSmalto } from '../../lib/colori'
import { centDaTesto } from '../../lib/money'
import type { TipoProdotto } from '../../lib/tipi'
import { SceltaColore } from './SceltaColore'
import type { NuovaVoce } from './datiCatalogo'

const TIPI: { chiave: TipoProdotto; titolo: string }[] = [
  { chiave: 'cibo', titolo: 'Cibo' },
  { chiave: 'bevanda', titolo: 'Bevanda' },
  { chiave: 'offerta', titolo: 'Offerta' },
]

/** Nome, tipo, prezzo, colore; per le offerte anche quanti pezzi e di che tipo. */
export function NuovoProdotto({
  edizioneId,
  quante,
  onAggiungi,
}: {
  edizioneId: string
  quante: number
  onAggiungi: (voce: NuovaVoce) => void
}) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoProdotto>('cibo')
  const [prezzo, setPrezzo] = useState('')
  const [pezzi, setPezzi] = useState('3')
  const [tipi, setTipi] = useState<TipoProdotto[]>(['cibo'])
  const [colore, setColore] = useState<string | null>(null)
  const scelto = colore ?? TINTE[quante % TINTE.length].hex

  const alterna = (t: TipoProdotto) =>
    setTipi((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))

  return (
    <form
      className="plancia p-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const pulito = nome.trim()
        if (!pulito) return
        const cent = prezzo.trim() === '' ? null : centDaTesto(prezzo)
        if (prezzo.trim() !== '' && cent === null) return
        const n = Number(pezzi)
        if (tipo === 'offerta' && (!Number.isInteger(n) || n < 1 || tipi.length === 0)) return
        onAggiungi({
          edizione_id: edizioneId,
          nome: pulito,
          tipo,
          prezzo_cent: cent,
          colore: scelto,
          ordine: quante + 1,
          pezzi_scelta: tipo === 'offerta' ? n : null,
          tipi_scelta: tipo === 'offerta' ? tipi : null,
        })
        setNome('')
        setPrezzo('')
        setColore(null)
      }}
    >
      <div role="group" aria-label="Tipo della voce" className="flex gap-0.5 p-0.5 rounded-full self-start"
           style={{ background: 'var(--surf2)' }}>
        {TIPI.map((t) => (
          <button key={t.chiave} type="button" aria-pressed={tipo === t.chiave} onClick={() => setTipo(t.chiave)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-semibold aria-pressed:bg-[var(--act-bg)] aria-pressed:text-[var(--act-ink)] tenue aria-pressed:opacity-100">
            {t.titolo}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input aria-label="Nome della nuova voce" placeholder="Nome" value={nome}
               onChange={(e) => setNome(e.target.value)} className="campo flex-1 min-w-0 min-h-[48px] px-3" />
        <input aria-label="Prezzo della nuova voce" placeholder="€" inputMode="decimal" value={prezzo}
               onChange={(e) => setPrezzo(e.target.value)} className="campo w-24 min-h-[48px] px-3 text-right" />
      </div>
      {tipo === 'offerta' && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-2">
            <span className="tenue">Si scelgono</span>
            <input aria-label="Quanti pezzi si scelgono" inputMode="numeric" value={pezzi}
                   onChange={(e) => setPezzi(e.target.value)} className="campo w-14 min-h-[40px] px-2 text-center" />
            <span className="tenue">pezzi fra:</span>
          </label>
          {(['cibo', 'bevanda'] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="checkbox" checked={tipi.includes(t)} onChange={() => alterna(t)} />
              {t === 'cibo' ? 'cibi' : 'bevande'}
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <SceltaColore valore={scelto} onScegli={setColore} />
        </div>
        <button type="submit" className="bottone-quieto min-h-[48px] px-4 text-[15px] shrink-0"
                style={{ background: scelto, color: inchiostroPerSmalto(scelto) }}>
          Aggiungi
        </button>
      </div>
    </form>
  )
}
