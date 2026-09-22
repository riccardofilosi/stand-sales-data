/** Ordine di lettura: `ordine` poi nome, con `it` perché À viene prima di B. */
export function inFila<T extends { ordine: number; nome: string }>(righe: readonly T[]): T[] {
  return [...righe].sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'))
}

/**
 * Le righe da riscrivere per spostare `indice` di un posto in `verso`.
 * `ordine` ha default 0: finché nessuno ha riordinato è tutto a pari merito,
 * quindi si riscrive la posizione di tutto il livello e poi si scambiano le
 * due interessate. Restituisce solo ciò che cambia.
 */
export function nuovoOrdine(
  righe: readonly { id: string; ordine: number }[],
  indice: number,
  verso: -1 | 1,
): { id: string; ordine: number }[] {
  const vicino = indice + verso
  if (indice < 0 || indice >= righe.length || vicino < 0 || vicino >= righe.length) return []
  const posizioni = righe.map((r, i) => ({ id: r.id, ordine: i + 1 }))
  const dopo = posizioni.map((r, i) =>
    i === indice ? { ...r, ordine: posizioni[vicino].ordine }
    : i === vicino ? { ...r, ordine: posizioni[indice].ordine }
    : r,
  )
  return dopo.filter((r, i) => r.ordine !== righe[i].ordine)
}
