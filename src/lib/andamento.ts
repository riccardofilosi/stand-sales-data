/**
 * Gli aggregati della serata. Si conta quello che è uscito, e basta.
 * Tutto passa dalla quantità con segno: uno storno è una riga negativa,
 * quindi ogni somma si annulla da sola.
 */

import type { Prodotto, Vendita } from './tipi'

export type Fascia = {
  etichetta: string
  pezzi: number
  incassoCent: number
  /** L'ultima è in corso: alle 23:14 vale quattordici minuti, non trenta. */
  corrente: boolean
}

export type VoceClassifica = {
  chiave: string
  nome: string
  colore: string
  tipo: Prodotto['tipo']
  /** Pezzi veri: venduti sciolti o scelti dentro un'offerta. */
  pezzi: number
  /** Pezzi stimati dalle offerte generiche (senza componenti scelti). */
  stimati: number
  incassoCent: number
}

const MEZZORA = 30 * 60 * 1000
const dueCifre = (n: number) => String(n).padStart(2, '0')

function scalini(aperturaIso: string | null, adesso: Date): { inizio: number; quante: number } | null {
  if (!aperturaIso) return null
  const apertura = new Date(aperturaIso).getTime()
  const fine = adesso.getTime()
  if (!Number.isFinite(apertura) || fine < apertura) return null
  // Dalla mezz'ora tonda che contiene l'apertura: etichette su :00 e :30.
  const inizio = Math.floor(apertura / MEZZORA) * MEZZORA
  return { inizio, quante: Math.floor((fine - inizio) / MEZZORA) + 1 }
}

function indiceFascia(r: Vendita, inizio: number, quante: number): number | null {
  const t = new Date(r.registrato_il).getTime()
  if (!Number.isFinite(t)) return null
  const i = Math.floor((t - inizio) / MEZZORA)
  return i < 0 || i >= quante ? null : i
}

/** Fasce da mezz'ora dall'apertura a ora. */
export function perFascia(righe: readonly Vendita[], aperturaIso: string | null, adesso: Date): Fascia[] {
  const s = scalini(aperturaIso, adesso)
  if (!s) return []
  const fasce: Fascia[] = Array.from({ length: s.quante }, (_, i) => {
    const t = new Date(s.inizio + i * MEZZORA)
    return {
      etichetta: `${dueCifre(t.getHours())}:${dueCifre(t.getMinutes())}`,
      pezzi: 0,
      incassoCent: 0,
      corrente: i === s.quante - 1,
    }
  })
  for (const r of righe) {
    const i = indiceFascia(r, s.inizio, s.quante)
    if (i === null) continue
    if (!r.dentro_offerta) fasce[i].pezzi += r.quantita
    fasce[i].incassoCent += r.quantita * r.prezzo_cent
  }
  return fasce
}

/** Pezzi per fascia di ciascun prodotto scelto (componenti inclusi). */
export function perFasciaProdotto(
  righe: readonly Vendita[],
  prodottoIds: readonly string[],
  aperturaIso: string | null,
  adesso: Date,
): Map<string, number[]> {
  const serie = new Map<string, number[]>()
  const s = scalini(aperturaIso, adesso)
  if (!s) return serie
  for (const id of prodottoIds) serie.set(id, Array.from({ length: s.quante }, () => 0))
  for (const r of righe) {
    const v = serie.get(r.prodotto_id)
    if (!v) continue
    const i = indiceFascia(r, s.inizio, s.quante)
    if (i !== null) v[i] += r.quantita
  }
  return serie
}

export function cumulate(fasce: readonly Fascia[]): number[] {
  let somma = 0
  return fasce.map((f) => (somma += f.pezzi))
}

export function riepiloga(righe: readonly Vendita[]) {
  let pezzi = 0
  let incassoCent = 0
  // Un ordine stornato per intero è comunque un cliente passato: si conta.
  const ordini = new Set<string>()
  for (const r of righe) {
    // I componenti a zero non sono pezzi in più passati sul banco.
    if (!r.dentro_offerta) pezzi += r.quantita
    incassoCent += r.quantita * r.prezzo_cent
    if (r.storna_id === null) ordini.add(r.ordine_id)
  }
  return { pezzi, incassoCent, ordini: ordini.size }
}

/**
 * Classifica per voce. Le offerte contano come voce. Le offerte GENERICHE
 * (gesto senza componenti) stimano i pezzi: `pezzi_scelta` si divide per il
 * numero di tipi ammessi; la quota del tipo cibo si spalma sui cibi non
 * nascosti; la quota bevanda si scarta (non si sa quale spritz).
 */
export function classifica(righe: readonly Vendita[], prodotti: readonly Prodotto[]): VoceClassifica[] {
  const indice = new Map(prodotti.map((p) => [p.id, p]))
  const conti = new Map<string, VoceClassifica>()
  const voce = (p: Prodotto) => {
    let v = conti.get(p.id)
    if (!v) {
      v = { chiave: p.id, nome: p.nome, colore: p.colore, tipo: p.tipo, pezzi: 0, stimati: 0, incassoCent: 0 }
      conti.set(p.id, v)
    }
    return v
  }

  const gestiConComponenti = new Set(righe.filter((r) => r.dentro_offerta).map((r) => r.gesto_id))
  // Uno storno fa gesto da solo: per sapere se l'offerta stornata era
  // generica si risale al gesto della riga originale. Se l'originale non è
  // fra le righe (storno orfano), non si sa se aveva componenti: niente stima.
  const gestoDi = new Map(righe.map((r) => [r.id, r.gesto_id]))
  const cibi = prodotti.filter((p) => p.tipo === 'cibo' && !p.nascosto)

  for (const r of righe) {
    const p = indice.get(r.prodotto_id)
    if (!p) continue
    const v = voce(p)
    v.pezzi += r.quantita
    v.incassoCent += r.quantita * r.prezzo_cent

    if (p.tipo !== 'offerta' || !p.pezzi_scelta || !p.tipi_scelta) continue
    const gesto = r.storna_id ? gestoDi.get(r.storna_id) : r.gesto_id
    if (gesto === undefined) continue
    if (gestiConComponenti.has(gesto)) continue
    if (!p.tipi_scelta.includes('cibo') || cibi.length === 0) continue
    const quotaCibo = (p.pezzi_scelta / p.tipi_scelta.length) * r.quantita
    for (const c of cibi) voce(c).stimati += quotaCibo / cibi.length
  }

  return [...conti.values()]
    .map((v) => ({ ...v, stimati: Math.round(v.stimati * 100) / 100 }))
    .filter((v) => v.pezzi !== 0 || v.stimati !== 0)
    .sort((a, b) => b.pezzi - a.pezzi || b.stimati - a.stimati || a.nome.localeCompare(b.nome, 'it'))
}

/** Gli ordini registrati, dal più recente, con i gesti annullabili. */
export type OrdineRegistrato = {
  ordineId: string
  ora: string
  gesti: Array<{
    gestoId: string
    nome: string
    colore: string
    /** Nomi dei componenti scelti, o vuoto. */
    dettaglio: string
    prezzoCent: number
    stornato: boolean
    idAnnullabili: string[]
  }>
  lordoCent: number
  nettoCent: number
}

export function ordiniRegistrati(
  righe: readonly Vendita[],
  prodotti: readonly Prodotto[],
  quanti = 8,
): OrdineRegistrato[] {
  const indice = new Map(prodotti.map((p) => [p.id, p]))
  const stornate = new Set(righe.filter((r) => r.storna_id).map((r) => r.storna_id as string))
  const perOrdine = new Map<string, Vendita[]>()
  for (const r of righe) {
    const lista = perOrdine.get(r.ordine_id) ?? []
    lista.push(r)
    perOrdine.set(r.ordine_id, lista)
  }

  const ordini: OrdineRegistrato[] = []
  for (const [ordineId, lista] of perOrdine) {
    const originali = lista.filter((r) => r.storna_id === null)
    if (originali.length === 0) continue

    const perGesto = new Map<string, OrdineRegistrato['gesti'][number]>()
    const componenti = new Map<string, string[]>()
    for (const r of originali) {
      const p = indice.get(r.prodotto_id)
      const nome = p?.nome ?? 'Voce tolta dal menu'
      const g = perGesto.get(r.gesto_id) ?? {
        gestoId: r.gesto_id, nome: '', colore: '#4A6670', dettaglio: '',
        prezzoCent: 0, stornato: false, idAnnullabili: [],
      }
      if (r.dentro_offerta) {
        componenti.set(r.gesto_id, [...(componenti.get(r.gesto_id) ?? []), nome])
      } else {
        g.nome = nome
        g.colore = p?.colore ?? g.colore
      }
      g.prezzoCent += r.quantita * r.prezzo_cent
      if (stornate.has(r.id)) g.stornato = true
      else g.idAnnullabili.push(r.id)
      perGesto.set(r.gesto_id, g)
    }
    for (const g of perGesto.values()) {
      g.dettaglio = (componenti.get(g.gestoId) ?? []).join(' · ')
      // Un gesto si annulla intero: se una sua riga è già stornata, basta.
      if (g.stornato) g.idAnnullabili = []
    }

    // L'ora dell'ordine è la più antica fra le righe originali, non la
    // prima incontrata: l'ordine di arrivo delle righe non è garantito.
    const ora = originali.reduce(
      (min, r) => (Date.parse(r.registrato_il) < Date.parse(min) ? r.registrato_il : min),
      originali[0].registrato_il,
    )

    ordini.push({
      ordineId,
      ora,
      gesti: [...perGesto.values()],
      lordoCent: originali.reduce((s, r) => s + r.quantita * r.prezzo_cent, 0),
      nettoCent: lista.reduce((s, r) => s + r.quantita * r.prezzo_cent, 0),
    })
  }
  return ordini.sort((a, b) => Date.parse(b.ora) - Date.parse(a.ora)).slice(0, quanti)
}
