const formattatore = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
})

/** Converte centesimi interi in stringa da mostrare. Unico punto in cui si divide per 100. */
export function euro(cent: number): string {
  return formattatore.format(cent / 100)
}

/**
 * Da quello che si digita a centesimi interi, senza mai passare per la
 * virgola mobile: `3.35 * 100` in JavaScript fa 334.99999999999994, e un
 * centesimo perso su un prezzo di listino si moltiplica per ogni riga della
 * serata.
 *
 * Restituisce `null` su tutto ciò che non è un importo scritto bene, inclusi
 * i millesimi: arrotondare in silenzio nasconderebbe un errore di battitura.
 */
export function centDaTesto(testo: string): number | null {
  const pulito = testo.trim().replace(',', '.')
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(pulito)) return null
  const [interi, decimali = ''] = pulito.split('.')
  return Number(interi) * 100 + Number(decimali.padEnd(2, '0'))
}

/** L'inverso, per riempire un campo. Il prezzo mancante è una casella vuota. */
export function testoDaCent(cent: number | null): string {
  if (cent === null) return ''
  return `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, '0')}`
}
