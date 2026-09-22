import { useState } from 'react'
import { Avviso } from '../../guscio/Avviso'
import { supabase } from '../../lib/supabase'
import { messaggioErrore } from '../../lib/errori'
import type { Edizione } from '../../lib/tipi'
import { componiCsv, nomeFile, type RigaEsportabile } from './esportazione'

type RigaGrezza = {
  registrato_il: string
  quantita: number
  prezzo_cent: number
  ordine_id: string
  gesto_id: string
  dentro_offerta: boolean
  storna_id: string | null
  prodotti: { nome: string; tipo: string } | null
  profiles: { nome: string } | null
}

/** Scarica senza server; il BOM davanti evita «BaccalÃ » su Excel Windows. */
function scarica(nome: string, contenuto: string) {
  const blob = new Blob([`﻿${contenuto}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

export function Esporta({ edizione }: { edizione: Edizione }) {
  const [inCorso, impostaInCorso] = useState(false)
  const [errore, impostaErrore] = useState<string | null>(null)

  const esporta = async () => {
    impostaInCorso(true)
    impostaErrore(null)
    try {
      const { data, error } = await supabase
        .from('vendite')
        .select('registrato_il, quantita, prezzo_cent, ordine_id, gesto_id, dentro_offerta, storna_id, prodotti(nome, tipo), profiles(nome)')
        .eq('edizione_id', edizione.id)
        .order('registrato_il', { ascending: true })
      if (error) throw new Error(messaggioErrore(error))
      const righe: RigaEsportabile[] = ((data ?? []) as unknown as RigaGrezza[]).map((r) => ({
        registrato_il: r.registrato_il,
        tipo: r.prodotti?.tipo ?? '',
        prodotto: r.prodotti?.nome ?? '',
        quantita: r.quantita,
        prezzo_cent: r.prezzo_cent,
        operatore: r.profiles?.nome ?? '',
        ordine: r.ordine_id,
        gesto: r.gesto_id,
        dentro_offerta: r.dentro_offerta,
        storno: r.storna_id !== null,
      }))
      if (righe.length === 0) return impostaErrore('Nessuna vendita da esportare.')
      scarica(nomeFile(edizione.nome, edizione.anno), componiCsv(righe))
    } catch (e) {
      impostaErrore((e as Error).message)
    } finally {
      impostaInCorso(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={inCorso} onClick={() => void esporta()} className="bottone-quieto min-h-[48px] px-4 text-[15px] self-start">
        {inCorso ? 'Preparo il file…' : 'Scarica il CSV'}
      </button>
      {errore && <Avviso nudo>{errore}</Avviso>}
    </div>
  )
}
