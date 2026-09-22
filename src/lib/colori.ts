/**
 * Le venti tinte dei prodotti.
 *
 * Dalla 022 il colore sta sul prodotto, non sulla famiglia, e il database
 * controlla solo il FORMATO (`prodotti.colore CHECK ~ '^#[0-9A-F]{6}$'`):
 * la curatela della palette vive tutta qui. Il selettore offre solo queste,
 * quindi due tinte indistinguibili non possono nascere per sbaglio.
 *
 * Le prime sette sono le storiche, identiche all'esadecimale: i prodotti in
 * archivio le citano. Le tredici nuove sono vagliate su due criteri:
 * luminanza WCAG lontana dalla soglia 0,18 di inchiostroPerSmalto (sotto
 * 0,13 o sopra 0,24, cosi' l'inchiostro sopra resta netto) e distanza minima
 * fra coppie dE76 >= 15,9 sull'intero ventaglio. Con venti tinte i margini
 * delle sette originali (dE 26/21 anche in deuteranopia) non sono
 * raggiungibili: e' coperto dal nome, che sul bottone c'e' sempre — il
 * colore non porta mai da solo l'informazione.
 */
export const TINTE = [
  { nome: 'Arancio bruciato', hex: '#B84A10' },
  { nome: 'Blu petrolio',     hex: '#0B63A8' },
  { nome: 'Ocra',             hex: '#D9A020' },
  { nome: 'Indaco',           hex: '#4A4FB5' },
  { nome: 'Bruno oro',        hex: '#8A6A0E' },
  { nome: 'Azzurro',          hex: '#4FA0DC' },
  { nome: 'Vinaccia',         hex: '#A02B57' },
  { nome: 'Mattone',          hex: '#B02E20' },
  { nome: 'Verde bosco',      hex: '#166B2B' },
  { nome: 'Verde laguna',     hex: '#0B655C' },
  { nome: 'Blu notte',        hex: '#23408F' },
  { nome: 'Viola melanzana',  hex: '#7A3AA0' },
  { nome: 'Magenta scuro',    hex: '#A81371' },
  { nome: 'Cacao',            hex: '#6B4226' },
  { nome: 'Verde mela',       hex: '#7FBF4D' },
  { nome: 'Turchese',         hex: '#45C4B0' },
  { nome: 'Pesca',            hex: '#F2A07B' },
  { nome: 'Rosa',             hex: '#E88FB4' },
  { nome: 'Lilla',            hex: '#B39DDB' },
  { nome: 'Grigio perla',     hex: '#B9C0C8' },
] as const

export type Tinta = (typeof TINTE)[number]['hex']

export function eTintaValida(hex: string): boolean {
  const cercato = hex.toUpperCase()
  return TINTE.some((t) => t.hex === cercato)
}

/** Luminanza relativa WCAG di un colore `#rrggbb`. */
function luminanza(esadecimale: string): number {
  const n = Number.parseInt(esadecimale.slice(1), 16)
  const canali = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * canali[0] + 0.7152 * canali[1] + 0.0722 * canali[2]
}

/**
 * Il colore in cui scrivere sopra una targa: scuro sugli smalti chiari, chiaro
 * su quelli scuri. Delle sette tinte solo ocra e azzurro chiedono inchiostro
 * scuro; la soglia resta calcolata e non elencata, cosi' regge anche se un
 * giorno il ventaglio cambiasse.
 */
export function inchiostroPerSmalto(coloreEsadecimale: string | null): string {
  if (!coloreEsadecimale || !/^#[0-9a-f]{6}$/i.test(coloreEsadecimale)) {
    return 'var(--smalto-chiaro)'
  }
  return luminanza(coloreEsadecimale) > 0.18
    ? 'var(--smalto-scuro)'
    : 'var(--smalto-chiaro)'
}
