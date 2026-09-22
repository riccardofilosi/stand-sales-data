# Console — il sistema visivo

Riferimento vincolante per ogni schermata. Chi implementa la UI legge questo file
prima di scrivere codice. Sostituisce `sistema-visivo.md`, che descriveva una
direzione diversa — carta calda, due temi, serif per le cifre — abbandonata il
14/08/2026 dopo il confronto fra tre direzioni.

## La direzione

Fondo quasi-nero, piastrelle di colore pieno, cifre grandi di peso leggero.
L'app somiglia a uno strumento, non a un documento: si guarda di sfuggita, si
tocca al buio, e ciò che conta deve saltare fuori da solo.

I componenti — schede, bottoni, campi, pastiglie, scala tipografica — vengono da
due kit scelti dal committente, uno bancario e uno di interfacce AI. **Ne è stata
presa la forma, non il mestiere:** niente carte di credito, portafogli, storici
transazioni, bolle di chat. Quelle sono metafore che a una sagra non
corrispondono a niente.

## Vincoli che vengono prima dell'estetica

Si usa in piedi, di fretta, con le mani bagnate, mentre qualcuno aspetta il
resto. Quando estetica e funzione confliggono, vince la funzione.

1. **Bersagli da 96px** su ogni gesto che vende: targhe, «Registra ordine». Un
   tocco sbagliato costa un ordine, e in cassa non c'è tempo di correggere.
2. **Cifre tabulari** (`font-variant-numeric: tabular-nums`) su ogni importo,
   ogni quantità, ogni asse. Senza, il totale balla mentre cambia e non si legge
   di sfuggita. È la classe `.num`, e non sta su `body` apposta: dentro il testo
   corrente le cifre proporzionali restano giuste.
3. **Niente animazioni oltre i 200ms** sui percorsi di vendita. L'unica eccezione
   è l'anello dell'attesa, lento per necessità.
4. **`prefers-reduced-motion` rispettato**: tutto ciò che si muove ha una
   versione ferma che porta la stessa informazione.

Due scostamenti dai 96px, accettati:

- **Le pastiglie di insieme stanno a 44px.** Non vendono: scelgono quale gruppo
  di targhe mostrare. A 96px spingerebbero la prima fila di targhe sotto la
  piega, cioè costerebbero scorrimento al gesto che invece paga.
- **Il passo della quantità sta a 44px.** Corregge, non vende.

La condizione che li tiene onesti: **in cassa nessun bersaglio sotto i 96px può
fare danno al primo tocco.** Lo storno infatti non lo fa — chiede un secondo
tocco e si disarma da solo dopo quattro secondi.

Fuori dalla cassa il minimo scende a **48px**: Listino, Edizione, Acquisti e
Persone si usano da seduti, giorni prima o giorni dopo. A 96px un listino di
trenta prodotti diventa un chilometro di scorrimento, e trovare la riga giusta
costa più di quanto costi mancarla.

## Una superficie sola

Niente tema chiaro, niente interruttore. Non è pigrizia: l'impianto **dipende**
dal fondo grafite. Su carta chiara le tinte si spengono e il
riconoscimento per colore — che è tutto il vantaggio della griglia — si perde.

Ne segue che `color-scheme: dark` va dichiarato: barre di scorrimento, tendine
native dei `<select>`, selettore di data in Acquisti e cursore nei campi di testo
il browser li dipinge da sé, e li prende da lì e da nient'altro.

## Colore

Definiti come variabili CSS in `src/index.css`. Nel codice si usano solo le
variabili, mai i valori esadecimali.

| Variabile | Valore | Cos'è |
|---|---|---|
| `--bg` | `#141718` | Il fondo. Nero appena freddo, non nero puro |
| `--surf` | `#1E2124` | Le schede |
| `--surf2` | `#282C31` | Ciò che sta sopra una scheda: passi, interruttori |
| `--ink` | `#FFFFFF` | Il testo |
| `--muted` | `#8B9297` | Il secondario — **5,71:1** sul fondo: è testo, non decorazione |
| `--act-bg` / `--act-ink` | `#FFFFFF` / `#141718` | L'azione: l'inverso della pagina, il contrasto più alto che esista |
| `--rosso` | `#FF8FA3` | Il rosso **scritto** — 7,48:1 sulle schede |
| `--rosso-fondo` | `#A31621` | Il rosso **dipinto** — ci si scrive sopra in bianco a 7,80:1 |

**Il rosso è due, e non è un capriccio.** Un solo valore non può stare leggibile
sia come testo su fondo scuro sia come fondo sotto testo bianco. Schiarire quello
dipinto farebbe crollare il testo che ci sta sopra.

**Verde e rosso non portano mai da soli un'informazione.** Circa un uomo su
dodici non li distingue. La variazione in Andamento porta una freccia e una
parola oltre al colore; l'avviso d'errore porta un badge «!».

## Le venti tinte

Dal 2026-08-17 (migrazione 022) il colore appartiene al **prodotto**, non
all'insieme, e il ventaglio è salito da sette a venti su richiesta del
committente: con una tinta per prodotto, sette non bastavano più.

Le prime sette sono le storiche, misurate contro la simulazione di daltonismo
(Viénot-Brettel-Mollon) e la separazione a vista piena (ΔE 26,1 pieno / 21,6
deuteranopia). Le tredici nuove sono vagliate su due criteri: luminanza WCAG
lontana dalla soglia 0,18 di `inchiostroPerSmalto` (sotto 0,13 o sopra 0,24,
così l'inchiostro sopra resta netto) e distanza minima fra coppie **ΔE76 ≥
15,9** sull'intero ventaglio. Con venti tinte i margini delle sette non sono
raggiungibili: è coperto dal nome, che sul bottone c'è sempre — il colore non
porta mai da solo l'informazione.

Il vincolo del database è di **formato** (`prodotti.colore CHECK ~
'^#[0-9A-F]{6}$'`, migrazione 022): la curatela vive in `src/lib/colori.ts`,
che è l'unico ventaglio offerto dall'interfaccia, e i test
(`tests/unit/colori.test.ts`) tengono le tinte dentro le regole qui sopra.

Le tinte, coi nomi: le sette storiche (Arancio bruciato `#B84A10`, Blu petrolio
`#0B63A8`, Ocra `#D9A020`, Indaco `#4A4FB5`, Bruno oro `#8A6A0E`, Azzurro
`#4FA0DC`, Vinaccia `#A02B57`) più Mattone `#B02E20`, Verde bosco `#166B2B`,
Verde laguna `#0B655C`, Blu notte `#23408F`, Viola melanzana `#7A3AA0`, Magenta
scuro `#A81371`, Cacao `#6B4226`, Verde mela `#7FBF4D`, Turchese `#45C4B0`,
Pesca `#F2A07B`, Rosa `#E88FB4`, Lilla `#B39DDB`, Grigio perla `#B9C0C8`.

**L'inchiostro sopra una tinta si calcola, non si elenca.** A occhio si sbaglia:
l'arancio sembra scuro e invece con testo bianco fa 5,22:1 e con testo nero solo
3,45:1. La soglia è la luminanza relativa a 0,18, in `inchiostroPerSmalto()`, e
regge anche se un giorno il ventaglio cambiasse.

**La pastiglia spenta spegne il fondo, non il testo.** Con `opacity` sbiadirebbe
anche la scritta; con la tinta al 26% sul grafite il testo bianco resta fra
11:1 e 15,4:1, e la tinta si riconosce lo stesso perché è il fondo a cambiare.

**Le cifre non stanno mai sopra lo smalto.** Il prezzo sta su un cartiglio bianco
fisso, dove il contrasto supera 16:1. Sbagliare un prezzo letto è il solo errore
che costa denaro, e questo vincolo non ammette eccezioni.

## Tipografia

**Poppins**, tre pesi, installata via npm: la PWA deve funzionare senza CDN, e la
Content Security Policy blocca comunque i domini terzi.

- **400** — il corpo
- **500** — le cifre grandi, che grandi non hanno bisogno di peso
- **600** — nomi di prodotto, comandi, etichette

Scala: 11 / 12 / 13 / 14 / 15 / 17 / 22 / 28 / 32 / 44. Il totale in cassa sta a
44, l'incasso in Andamento a 38, i nomi sulle targhe a 15. Le etichette in
maiuscoletto stanno a 11 con `letter-spacing: .1em`.

## Le targhe

Colore pieno, angoli di 20px, il nome sopra e il prezzo sul cartiglio. Niente
velo di luce, niente ombra: su fondo grafite il colore pieno basta a staccare, e
un'ombra su nero non si vede — aggiunge solo pixel da ridisegnare.

**La pressione affonda la targa** (`scale(.96)`) invece di sollevarla: risponde
come un tasto vero, e su un telefono tenuto con una mano sola la conferma tattile
conta più dell'eleganza.

**Un contatore in alto a destra** dice quante se ne sono già battute, così non
serve guardare in fondo per saperlo.

## L'animazione firma

L'anello che si svuota nei tre secondi dell'attesa. È l'unico momento in cui
l'app chiede di essere guardata.

Dentro c'è **una spunta, non un numero**. Contare alla rovescia da tre non serve
a decidere niente — o ci si accorge dell'errore, o non ci si accorge — e un
numero che scende invita a guardarlo invece di servire il cliente. Con
`prefers-reduced-motion` l'anello resta pieno: la spunta e il testo portano
comunque l'informazione.

La durata sta in un posto solo, `Trattenuto.tsx`, e la CSS la legge da lì con una
variabile: due numeri in due file diversi prima o poi divergono.

## Il grafico

Tre forme sulla stessa griglia — blocchi, linea, cumulato — perché sono tre
domande diverse: quanto sta uscendo adesso, come è andata la serata, a che punto
siamo.

- **Passi leggibili** sull'asse dei valori: si sceglie il primo che in tre gradini
  copre il massimo, così l'asse dice 0 · 80 · 160 · 240 e non 0 · 72 · 144 · 216.
- **Al massimo sei etichette** sull'asse del tempo, prese dall'ultima e risalendo
  a passo costante. L'ultima c'è sempre: l'ora di adesso è la sola che si cerca.
- **La fascia in corso è tratteggiata**, in tutte e tre le forme. Alle 23:14 vale
  quattordici minuti su trenta: disegnata piena sembrerebbe un crollo delle
  vendite, e qualcuno manderebbe a casa metà squadra per niente.

## Cosa non fare

- Grigi blu freddi come colore di fondo
- Gradienti sulle superfici, vetro sfocato, `backdrop-filter` decorativi
- Ombre morbide e diffuse: su questo fondo non si vedono e costano ridisegno
- Emoji al posto dei nomi
- Animazioni d'ingresso a cascata sulla griglia: rallentano la prima vendita
- Un secondo tema «perché è bello averlo»
