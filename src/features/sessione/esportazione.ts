/** Una riga di vendita con tutto quello che serve a leggerla senza l'app. */
export type RigaEsportabile = {
  registrato_il: string
  tipo: string
  prodotto: string
  quantita: number
  prezzo_cent: number
  operatore: string
  ordine: string
  gesto: string
  dentro_offerta: boolean
  storno: boolean
}

export const INTESTAZIONI = [
  'ora', 'tipo', 'voce', 'quantita', 'prezzo', 'importo', 'operatore', 'ordine', 'gesto', 'dentro_offerta', 'storno',
] as const

/** Punto e virgola: Excel italiano usa la virgola come decimale. */
const SEPARATORE = ';'

function campo(valore: string): string {
  if (!/[";\r\n]/.test(valore)) return valore
  return `"${valore.replace(/"/g, '""')}"`
}

function euro(cent: number): string {
  const segno = cent < 0 ? '-' : ''
  const n = Math.abs(cent)
  return `${segno}${Math.floor(n / 100)},${String(n % 100).padStart(2, '0')}`
}

function quando(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Una riga per vendita, nessuna aggregazione: le pivot le fa chi legge. */
export function componiCsv(righe: readonly RigaEsportabile[]): string {
  const linee = [INTESTAZIONI.join(SEPARATORE)]
  for (const r of righe) {
    linee.push([
      quando(r.registrato_il), r.tipo, r.prodotto, String(r.quantita), euro(r.prezzo_cent),
      euro(r.prezzo_cent * r.quantita), r.operatore, r.ordine, r.gesto,
      r.dentro_offerta ? 'si' : '', r.storno ? 'si' : '',
    ].map(campo).join(SEPARATORE))
  }
  // A capo di Windows, o Excel mostra tutto su una riga.
  return linee.join('\r\n')
}

export function nomeFile(nomeEdizione: string, anno: number): string {
  const pulito = nomeEdizione.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${pulito || 'edizione'}-${anno}.csv`
}
