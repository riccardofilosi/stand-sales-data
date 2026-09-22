# Sagra Sales Data — raccolta e andamento delle vendite di uno stand

PWA React + Supabase. Si installa dal browser, non serve alcuno store.

Dal telefono, aperto l'indirizzo dell'app: «Aggiungi a schermata Home» — su Android il
browser lo propone da solo, su iOS sta nel menu di condivisione di Safari.

**L'app non sostituisce il bigliettino di carta**: il cassiere batte l'ordine,
dice il totale, incassa, tocca «Registra ordine» e consegna comunque il
foglietto. Registra in parallelo alla carta, non al posto suo — è il vincolo che
spiega metà delle assenze in questa app.

## Documenti

| | |
|---|---|
| `docs/design/console.md` | Colori, caratteri, superfici. Vincolante per la UI |

## Le sezioni

Due piani: all'apertura c'è l'**hub**, da lì si va in **Edizioni**; dentro
un'edizione stanno tre pastiglie.

| Sezione | Chi la usa | Quando |
|---|---|---|
| **Cassa** | chi incassa | durante — solo con l'edizione aperta |
| **Andamento** | il capo | durante e dopo |
| **Menu** | il capo | prima |
| **Edizioni** | il capo | prima e dopo: crea, apre, chiude, esporta |

Due ruoli soli: **capo** (uno) e **operatore** (tutti gli altri). L'operatore
vede hub e cassa; a decidere è la RLS, non la tendina.

## Primo avvio

### 1. Progetto Supabase

Creane uno gratuito su [supabase.com](https://supabase.com), **regione europea**.

### 2. Applica le migrazioni

Le migrazioni si impacchettano in un file solo, dentro un `begin`/`commit`:
dalla dashboard, SQL Editor, si incolla una volta sola. Se qualcosa fallisce non
resta applicato niente — che è il punto, perché uno schema mezzo vecchio e mezzo
nuovo è lo stato da cui non si torna indietro.

Tutte le migrazioni, dalla prima all'ultima:

```powershell
node scripts/pacchetto-migrazioni.mjs 001 024
```

Esce `supabase/pacchetto-001-024.sql`.

Poi verifica che nessuna tabella sia rimasta scoperta:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

Attese: `edizioni`, `prodotti`, `profiles`, `vendite`. **Tutte con
`rowsecurity = true`.** Anche una sola a `false` è una tabella leggibile da
chiunque abbia la chiave pubblica.

### 3. Crea il tuo account e nominati capo

Authentication → Users → Add user, oppure registrati dall'app. Prendi lo
`uuid` dell'utente (Authentication → Users, o `select id, nome, role from
public.profiles;`) e:

```sql
update public.profiles set role = 'capo' where id = '<uuid>';
```

Il capo **non si assegna dall'app**, e nemmeno dentro una migrazione: il valore
dell'enum non è utilizzabile nella stessa transazione che lo crea. Ce n'è uno
solo, e un trigger lo impone: per passarlo a un altro prima si toglie a chi ce
l'ha.

### 4. Regola la porta

Chi si registra nasce **operatore**, subito: legge il menu e batte in cassa,
niente altro. Il ruolo chiesto in fase di registrazione viene sempre ignorato,
anche per gli account creati dal pannello. Non c'è approvazione: chi ha
l'indirizzo e si iscrive è dentro, quindi **l'indirizzo non si pubblica** e le
registrazioni si chiudono quando la squadra è completa.

Authentication → Sign In / Providers:

- «Allow new users to sign up» **acceso** finché la squadra si iscrive, poi
  **spento**
- **attiva** «Prevent use of leaked passwords»
- porta la lunghezza minima della password a **12**

Authentication → URL Configuration:

- **Site URL** = l'indirizzo pubblico dell'app — è dove atterra il link di
  conferma email

**Il TOTP no, e non è una dimenticanza.** Attivarlo nel progetto non protegge
niente da solo: l'iscrizione del fattore la deve fare l'app chiamando
`supabase.auth.mfa.enroll()`, e quella schermata non esiste. Accenderlo darebbe
l'impressione di una difesa che non c'è.

### 5. Collega l'app

```powershell
Copy-Item .env.example .env.local
```

Riempi `.env.local` con `Project URL` e `anon key`, da Project Settings → API.

La chiave `service_role` **non va in questo file, né in nessun altro**. Scavalca
integralmente le regole di accesso e non ha ragione di esistere fuori dalla
dashboard.

### 6. Avvia

```powershell
npm install
npm run dev
```

Per aprirla dal telefono sulla stessa rete: `npm run dev -- --host`, e usa
l'indirizzo `Network` che stampa.

> Da un indirizzo `http://192.168…` il browser **non è in contesto sicuro**:
> `crypto.randomUUID` non esiste e il service worker non si registra. L'app
> funziona lo stesso — c'è un ripiego per gli identificativi — ma non si installa
> in home. Per quello serve HTTPS.

### 7. Apri l'edizione

Da **Edizioni** creane una (anno e nome), entra in **Menu** e aggiungi le voci:
ognuna ha un tipo — **cibo**, **bevanda** o **offerta** — un prezzo e un
colore. Un'offerta è una voce in più: si dice **quanti pezzi** si scelgono e
**fra quali tipi** (cibi, bevande o entrambi); in cassa la scelta la fa il
cassiere sul momento, i pezzi scelti finiscono a zero e il prezzo lo porta la
riga dell'offerta. Se l'anno scorso c'era un'edizione, il menu si copia da lì.

Poi **Apri la cassa**. `apri_edizione` rifiuta se il menu è vuoto o se una voce
visibile non ha prezzo: è il momento in cui il menu smette di essere
modificabile a piacere, e conviene che sia completo. Un'edizione aperta alla
volta; una chiusa si può riaprire da Edizioni («Riapri»), per il «Chiudi»
toccato per sbaglio.

Finché nessuna edizione è aperta, la cassa non registra niente — per costruzione,
non per dimenticanza.

## Comandi

| | |
|---|---|
| `npm run dev` | Sviluppo |
| `npm run build` | Compila per la produzione |
| `npm test` | Unità — la logica che tocca i soldi |
| `npm run db:check` | Applica le migrazioni a un Postgres effimero e le mette alla prova |
| `npm run test:security` | Suite di attacco — richiede credenziali |
| `npm run test:e2e` | La cassa dal telefono, contro il database vero |
| `npm run lint` | oxlint |

### `db:check`

Esegue tutte le migrazioni su PostgreSQL compilato in WebAssembly, senza bisogno
di un database installato né di un progetto Supabase, e mette alla prova lo
schema: prezzi imposti dal server, idempotenza della coda, offerte a scelta
con componenti a zero, storni, un solo capo, apertura e chiusura di un'edizione.

Va lanciato dopo ogni modifica alle migrazioni. **Non sostituisce la prova sul
database vero, e su una cosa in particolare non dice niente:** PGlite gira come
superutente, quindi la RLS è scavalcata per definizione e nessuna policy viene
mai esercitata. A quello risponde solo la suite di attacco.

### Gli end-to-end

`npm run test:e2e` guida un Pixel 7 emulato sull'app vera: si batte, si
corregge, si registra, si ritira. La prova che conta è l'ultima — **rete
staccata a metà raffica**: tre ordini restano sul telefono e ripartono da soli
quando la linea torna.

Contro la build servita da `localhost`, che è contesto sicuro quanto HTTPS, gira
anche la suite dell'installabilità: service worker, manifest, icone, e il
ricaricamento a rete staccata che in sviluppo non si può provare.

```powershell
npm run build
npm run preview -- --port 4180
$env:E2E_URL="http://localhost:4180"; npx playwright test installabile
```

Le stesse prove girano contro la produzione cambiando `E2E_URL`. Come la suite
di attacco, lasciano ordini di prova nell'edizione aperta.

### La suite di attacco

`npm run test:security` **non verifica che l'app funzioni. Verifica che non
funzioni per chi non ha i permessi.** Ogni prova passa solo se l'attacco
fallisce.

Richiede `.env.test.local`, un account di prova con ruolo `operatore` e
**un'edizione aperta** con almeno una voce a prezzo: alcuni attacchi partono da
una vendita che deve esistere, e se non c'è la registra la suite stessa con
`registra_vendite`.

Lascia dietro di sé qualche vendita di prova nell'edizione aperta: non è una
suite da lanciare su un'edizione i cui totali contano.

## Come è protetta

Il frontend non è mai l'autorità. La chiave pubblica sta nel JavaScript servito
al browser — è previsto, non è una falla — ma significa che chiunque può
interrogare il database saltando l'interfaccia. Quindi ogni regola vive in
Postgres, non nei componenti React. **Nascondere un bottone non è un permesso.**

- **Row Level Security su ogni tabella.** Chi è autenticato legge tutto —
  edizioni, prodotti, vendite, profili. Chi non lo è non legge niente.
- **Scrive solo il capo**: edizioni, prodotti e ruoli passano da `is_capo()`.
- **Le vendite si scrivono solo da due funzioni**, `registra_vendite` e
  `storna_vendite`. `INSERT`, `UPDATE` e `DELETE` diretti su `vendite` sono
  revocati a tutti, anche agli autenticati.
- **I prezzi non passano dal client.** Il telefono manda quali prodotti e
  quanti; il server legge quanto costano dal menu e li congela sulla riga.
- **Il denaro è in centesimi interi.**
- **Nessuno cancella una vendita.** Stornare aggiunge una riga di quantità
  opposta che punta a quella sbagliata; una riga si storna una volta sola, uno
  storno non si storna, e solo dentro l'edizione aperta.
- **Ognuno storna le proprie righe; il capo quelle di chiunque.**
- **L'ora è quella del tocco**, stretta fra l'apertura dell'edizione e adesso.
- **Ogni nuovo utente nasce `operatore`**, e il ruolo non si legge mai dai
  metadati di registrazione.
- **Il capo è uno solo**: un trigger lo impone.
- **Un'edizione chiusa non si tocca più.**

Il modello di minaccia è concreto: un aiutante curioso o rancoroso, un telefono
perso, qualcuno che trova l'indirizzo. Non lo stato-nazione.

### Rischio residuo accettato

Non c'è PIN di riapertura, per non aggiungere attrito in cassa. Un telefono
sbloccato e sottratto durante l'evento dà accesso pieno finché la sessione non
viene revocata dal pannello di amministrazione.

Un operatore può stornare le proprie righe per coprire un ammanco. Non è
impedibile senza mettere la correzione dietro un'approvazione, e alle nove di
sera con la fila davanti significherebbe non correggere affatto. Ogni storno
resta in `vendite` con chi l'ha fatto e quando.

## Sviluppo

Codice sviluppato con Claude Code.
