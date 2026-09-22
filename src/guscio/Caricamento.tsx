/**
 * Il testo che si vede mentre qualcosa si prepara: l'accesso, l'edizione, il
 * listino. Un solo posto invece di sette, così un domani non diventano otto
 * varianti leggermente diverse dello stesso concetto.
 *
 * Due rese, perché due sono i contesti reali. Fuori dal Guscio non c'è ancora
 * niente sullo schermo e il testo si centra; dentro, il contenuto ha già il
 * suo margine e un secondo contenitore sposterebbe soltanto la riga rispetto
 * a ciò che la sostituisce un istante dopo.
 */
export function Caricamento({
  testo = 'Lettura…',
  schermoIntero = false,
}: {
  testo?: string
  schermoIntero?: boolean
}) {
  const contenuto = <p className="tenue text-[17px] py-6">{testo}</p>
  if (!schermoIntero) return contenuto
  return <div className="min-h-dvh grid place-items-center">{contenuto}</div>
}
