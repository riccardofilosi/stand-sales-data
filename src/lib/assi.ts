/**
 * Come si numerano gli assi di un grafico. Sta in `lib` e non nel componente
 * perche' e' aritmetica, non disegno: si prova senza montare niente.
 */

/**
 * Passi leggibili: si sceglie il primo che in tre gradini copre il massimo,
 * così l'asse dice 0 · 80 · 160 · 240 e non 0 · 72 · 144 · 216. Un asse che
 * non si legge a colpo d'occhio tanto vale non disegnarlo.
 */
const PASSI = [5, 10, 20, 25, 50, 80, 100, 150, 200, 250, 400, 500, 800, 1000, 1500, 2000, 4000]

export function scala(massimo: number) {
  const passo = PASSI.find((p) => p * 3 >= massimo) ?? PASSI[PASSI.length - 1]
  return { passo, cima: passo * 3 }
}

/**
 * Quante etichette stanno sull'asse del tempo senza toccarsi.
 *
 * Una serata sono quattordici mezz'ore e ci stavano tutte; una sessione
 * lasciata aperta da ieri ne fa cento, e scritte una accanto all'altra
 * diventano una striscia nera. Si tengono le ultime — quella di adesso è la
 * sola che si cerca davvero — e si risale all'indietro a passo costante.
 */
export function etichetteVisibili(quante: number, massimo = 6): Set<number> {
  const salto = Math.max(1, Math.ceil(quante / massimo))
  const viste = new Set<number>()
  for (let i = quante - 1; i >= 0; i -= salto) viste.add(i)
  return viste
}
