/**
 * L'ordine in corso: quello che il cassiere batte mentre il cliente aspetta.
 * Una riga per pezzo, come in `vendite`. Un'offerta è un gesto: la sua riga
 * a prezzo pieno più i componenti scelti a zero, tutti con lo stesso gesto.
 */

import type { Prodotto } from './tipi'

export type Pezzo = {
  /** Generato qui: è la ricevuta che rende innocuo il rinvio. */
  id: string
  prodottoId: string
  nome: string
  colore: string
  prezzoCent: number
  gestoId: string
  /** Vero sulla riga dell'offerta (generica o con componenti). */
  offerta: boolean
  /** Vero sui componenti scelti dentro un'offerta (prezzo zero). */
  dentroOfferta: boolean
  toccatoIl: string
}

export type Blocco =
  | { tipo: 'prodotto'; prodottoId: string; nome: string; colore: string;
      listinoCent: number; quantita: number; totaleCent: number }
  | { tipo: 'offerta'; gestoId: string; prodottoId: string; nome: string; colore: string;
      componenti: string[]; totaleCent: number }

/**
 * `crypto.randomUUID` esiste solo in contesto sicuro; aprendo l'app da
 * `http://192.168…` non c'è. `getRandomValues` c'è sempre.
 */
export function nuovoId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const esa = [...b].map((n) => n.toString(16).padStart(2, '0')).join('')
  return `${esa.slice(0, 8)}-${esa.slice(8, 12)}-${esa.slice(12, 16)}-${esa.slice(16, 20)}-${esa.slice(20)}`
}

export const totaleCent = (pezzi: readonly Pezzo[]): number =>
  pezzi.reduce((s, p) => s + p.prezzoCent, 0)

/** Pezzi liberi di quel prodotto (i componenti di un'offerta non contano). */
export const quantiDi = (pezzi: readonly Pezzo[], prodottoId: string): number =>
  pezzi.filter((p) => p.prodottoId === prodottoId && !p.dentroOfferta).length

export function aggiungi(pezzi: readonly Pezzo[], prodotto: Prodotto, ora: string): Pezzo[] {
  const id = nuovoId()
  return [
    ...pezzi,
    {
      id,
      prodottoId: prodotto.id,
      nome: prodotto.nome,
      colore: prodotto.colore,
      prezzoCent: prodotto.prezzo_cent ?? 0,
      gestoId: id,
      offerta: false,
      dentroOfferta: false,
      toccatoIl: ora,
    },
  ]
}

/** Offerta con i componenti scelti (o nessuno: offerta generica). */
export function aggiungiOfferta(
  pezzi: readonly Pezzo[],
  offerta: Prodotto,
  componenti: readonly Prodotto[],
  ora: string,
): Pezzo[] {
  const gestoId = nuovoId()
  const riga: Pezzo = {
    id: gestoId,
    prodottoId: offerta.id,
    nome: offerta.nome,
    colore: offerta.colore,
    prezzoCent: offerta.prezzo_cent ?? 0,
    gestoId,
    offerta: true,
    dentroOfferta: false,
    toccatoIl: ora,
  }
  const scelti: Pezzo[] = componenti.map((c) => ({
    id: nuovoId(),
    prodottoId: c.id,
    nome: c.nome,
    colore: c.colore,
    prezzoCent: 0,
    gestoId,
    offerta: false,
    dentroOfferta: true,
    toccatoIl: ora,
  }))
  return [...pezzi, riga, ...scelti]
}

/** Uno in meno: l'ultimo pezzo libero di quel prodotto. Le offerte si tolgono per gesto. */
export function togliUno(pezzi: readonly Pezzo[], prodottoId: string): Pezzo[] {
  for (let i = pezzi.length - 1; i >= 0; i--) {
    const p = pezzi[i]
    if (p.prodottoId === prodottoId && !p.dentroOfferta && !p.offerta) {
      return [...pezzi.slice(0, i), ...pezzi.slice(i + 1)]
    }
  }
  return [...pezzi]
}

/** Via tutto il gesto: l'offerta e i suoi componenti. */
export function togliGesto(pezzi: readonly Pezzo[], gestoId: string): Pezzo[] {
  return pezzi.filter((p) => p.gestoId !== gestoId)
}

/**
 * Come si mostrano: i pezzi liberi raggruppati per prodotto nell'ordine di
 * prima comparsa; ogni offerta un blocco proprio con i nomi dei componenti.
 */
export function raggruppa(pezzi: readonly Pezzo[]): Blocco[] {
  const blocchi: Blocco[] = []
  const perProdotto = new Map<string, Extract<Blocco, { tipo: 'prodotto' }>>()
  const perGesto = new Map<string, Extract<Blocco, { tipo: 'offerta' }>>()

  for (const p of pezzi) {
    if (p.dentroOfferta) {
      perGesto.get(p.gestoId)?.componenti.push(p.nome)
      continue
    }
    if (p.offerta) {
      const b = { tipo: 'offerta' as const, gestoId: p.gestoId, prodottoId: p.prodottoId,
                  nome: p.nome, colore: p.colore, componenti: [] as string[], totaleCent: p.prezzoCent }
      perGesto.set(p.gestoId, b)
      blocchi.push(b)
      continue
    }
    const gia = perProdotto.get(p.prodottoId)
    if (gia) {
      gia.quantita += 1
      gia.totaleCent += p.prezzoCent
      continue
    }
    const b = { tipo: 'prodotto' as const, prodottoId: p.prodottoId, nome: p.nome, colore: p.colore,
                listinoCent: p.prezzoCent, quantita: 1, totaleCent: p.prezzoCent }
    perProdotto.set(p.prodottoId, b)
    blocchi.push(b)
  }
  return blocchi
}

/** Il lotto come lo aspetta `registra_vendite()`. Nessun prezzo: lo legge il server. */
export function perIlServer(pezzi: readonly Pezzo[], ordineId: string) {
  return pezzi.map((p) => ({
    id: p.id,
    prodotto_id: p.prodottoId,
    quantita: 1,
    gesto_id: p.gestoId,
    ordine_id: ordineId,
    dentro_offerta: p.dentroOfferta,
    registrato_il: p.toccatoIl,
  }))
}
