#!/usr/bin/env node
// verifica-migrazioni.mjs
//
// Esegue tutte le migrazioni di supabase/migrations/ in ordine di nome su un
// database PGlite effimero (Postgres compilato in WebAssembly, plpgsql incluso)
// e si ferma rumorosamente al primo errore.
//
// Serve a scoprire a tavolino gli errori che altrimenti si manifesterebbero
// solo a runtime, cioe' durante una sagra.
//
// Uso: npm run db:check   (esce con codice != 0 se qualcosa fallisce)

import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '..', 'supabase', 'migrations');

// ---------------------------------------------------------------------------
// PRELUDIO — IMPALCATURA DI VERIFICA, *NON* UNA MIGRAZIONE.
//
// Questo SQL non deve mai finire in supabase/migrations/: ricrea a mano gli
// oggetti che su Supabase esistono gia' e che PGlite, essendo un Postgres
// nudo, non ha. Serve solo perche' le migrazioni possano compilare.
// ---------------------------------------------------------------------------
const PRELUDIO = `
-- Ruoli applicativi Supabase: le migrazioni fanno grant/revoke verso di loro.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Schema auth e tabella utenti ridotta al minimo indispensabile:
-- profiles.id ha una foreign key verso auth.users(id) e 003 ci installa sopra
-- il trigger on_auth_user_created.
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb,
  -- Su Supabase questa colonna c'e' gia': la riempie Auth a ogni accesso.
  -- Serve a stato_operatori() (017).
  last_sign_in_at    timestamptz
);

-- Sul database vero auth.uid() legge il JWT della richiesta. Qui restituisce
-- NULL: a noi interessa che le espressioni che la usano COMPILINO, non cosa
-- restituiscano. La prova funzionale la ridefinisce piu' avanti.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select null::uuid $$;
`;

// ---------------------------------------------------------------------------
// Utilita' di stampa
// ---------------------------------------------------------------------------
const ok = (s) => `  OK    ${s}`;
const ko = (s) => `  FALLITO ${s}`;

function contestoErrore(sql, position) {
  // `position` di Postgres e' un offset 1-based in caratteri sul testo inviato.
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos < 1) return null;
  const prima = sql.slice(0, pos - 1);
  const riga = prima.split('\n').length;
  const colonna = pos - (prima.lastIndexOf('\n') + 1);
  const righe = sql.split('\n');
  const da = Math.max(1, riga - 3);
  const a = Math.min(righe.length, riga + 3);
  const out = [`  posizione: riga ${riga}, colonna ${colonna} (offset ${pos})`];
  for (let n = da; n <= a; n++) {
    const marker = n === riga ? '>' : ' ';
    out.push(`  ${marker} ${String(n).padStart(4)} | ${righe[n - 1]}`);
    if (n === riga) out.push(`         | ${' '.repeat(Math.max(0, colonna - 1))}^`);
  }
  return out.join('\n');
}

function stampaErrorePostgres(etichetta, sql, err) {
  console.error('');
  console.error(`ERRORE in ${etichetta}`);
  console.error(`  messaggio: ${err.message}`);
  for (const campo of ['code', 'severity', 'detail', 'hint', 'where', 'schema',
                       'table', 'column', 'dataType', 'constraint', 'internalQuery']) {
    if (err[campo]) console.error(`  ${campo}: ${err[campo]}`);
  }
  const ctx = contestoErrore(sql, err.position);
  if (ctx) console.error(ctx);
  else console.error('  (Postgres non ha fornito una posizione: errore dentro un corpo di funzione o a runtime)');
  console.error('');
}

// ---------------------------------------------------------------------------
// Prova funzionale
// ---------------------------------------------------------------------------
const UTENTE_PROVA = '11111111-1111-4111-8111-111111111111';
const ALTRO_UTENTE = '22222222-2222-4222-8222-222222222222';

// Impalcatura di verifica, non una migrazione: dopo aver applicato tutto,
// auth.uid() viene ridefinita perche' restituisca un uuid fisso, altrimenti
// le funzioni sollevano subito 'non autenticato'. Serve anche un secondo
// utente (operatore): per provare che uno storno altrui venga rifiutato e
// che un secondo capo non entri.
const PRELUDIO_PROVA = `
insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values
  ('${UTENTE_PROVA}', 'cassa@example.test',  '{"nome":"Cassiere Prova"}'::jsonb, now()),
  ('${ALTRO_UTENTE}', 'altro@example.test',  '{"nome":"Altro Operatore"}'::jsonb, null)
on conflict (id) do nothing;

insert into public.profiles (id, nome, role) values
  ('${UTENTE_PROVA}', 'Cassiere Prova',  'capo'),
  ('${ALTRO_UTENTE}', 'Altro Operatore', 'operatore')
on conflict (id) do update set role = excluded.role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select '${UTENTE_PROVA}'::uuid $$;
`;

const esiti = [];
function verifica(nome, condizione, dettaglio) {
  esiti.push({ nome, passata: condizione, dettaglio });
  console.log(condizione ? ok(`${nome} — ${dettaglio}`) : ko(`${nome} — ${dettaglio}`));
}

const EDIZIONE = '5e5510e0-0000-4000-8000-000000000024';
const ORA = '2026-09-12T21:04:12.345Z';

function riga(n, prodotto, extra = {}) {
  const gesto = extra.gesto_id ?? `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`,
    prodotto_id: prodotto,
    quantita: 1,
    gesto_id: gesto,
    ordine_id: extra.ordine_id ?? gesto.replace(/^bbbbbbbb/, 'eeeeeeee'),
    dentro_offerta: false,
    registrato_il: ORA,
    ...extra,
  };
}

async function fallisce(db, sql, params) {
  try {
    await db.query(sql, params);
    return null;
  } catch (err) {
    return err.message;
  }
}

async function provaFunzionale(db) {
  console.log('');
  console.log('Prova funzionale dello schema 024');
  console.log('---------------------------------');

  await db.exec(PRELUDIO_PROVA);

  // Menu 2026 reale.
  await db.exec(`
    insert into public.edizioni (id, anno, nome) values ('${EDIZIONE}', 2026, 'Sagra 2026');
    insert into public.prodotti (id, edizione_id, nome, tipo, prezzo_cent, colore, ordine, pezzi_scelta, tipi_scelta) values
      ('9700d000-0000-4000-8000-000000000001', '${EDIZIONE}', 'Polpette di tonno', 'cibo',    200, '#B84A10', 1, null, null),
      ('9700d000-0000-4000-8000-000000000002', '${EDIZIONE}', 'Alici e pomodorini','cibo',    200, '#0B63A8', 2, null, null),
      ('9700d000-0000-4000-8000-000000000003', '${EDIZIONE}', 'Polenta in saor',   'cibo',    200, '#D9A020', 3, null, null),
      ('9700d000-0000-4000-8000-000000000004', '${EDIZIONE}', 'Aperol spritz',     'bevanda', 500, '#4A4FB5', 4, null, null),
      ('9700d000-0000-4000-8000-000000000005', '${EDIZIONE}', 'Hugo',              'bevanda', 500, '#8A6A0E', 5, null, null),
      ('0ffe0000-0000-4000-8000-000000000001', '${EDIZIONE}', '3 cicchetti',       'offerta', 500, '#4FA0DC', 6, 3, array['cibo']),
      ('0ffe0000-0000-4000-8000-000000000002', '${EDIZIONE}', 'Spritz + cicchetto','offerta', 500, '#A02B57', 7, 2, array['cibo','bevanda']);
  `);
  const POLPETTE = '9700d000-0000-4000-8000-000000000001';
  const ALICI    = '9700d000-0000-4000-8000-000000000002';
  const POLENTA  = '9700d000-0000-4000-8000-000000000003';
  const APEROL   = '9700d000-0000-4000-8000-000000000004';
  const TRE      = '0ffe0000-0000-4000-8000-000000000001';

  // 1) Non si apre con una voce senza prezzo.
  await db.exec(`insert into public.prodotti (edizione_id, nome, tipo, prezzo_cent, colore)
                 values ('${EDIZIONE}', 'Senza prezzo', 'cibo', null, '#B84A10');`);
  let msg = await fallisce(db, `select public.apri_edizione($1::uuid)`, [EDIZIONE]);
  verifica('1 — apertura rifiutata con una voce senza prezzo', msg?.includes('senza prezzo'), msg ?? 'NESSUNA ECCEZIONE');
  await db.exec(`delete from public.prodotti where nome = 'Senza prezzo';`);

  // 2) Si apre.
  await db.query(`select public.apri_edizione($1::uuid)`, [EDIZIONE]);
  const stato = (await db.query(`select stato from public.edizioni where id = $1`, [EDIZIONE])).rows[0].stato;
  verifica('2 — edizione aperta', stato === 'aperta', `stato=${stato}`);

  // 3) Vendita semplice: prezzo dal listino, non dal client.
  await db.query(`select public.registra_vendite($1::jsonb)`,
    [JSON.stringify([{ ...riga(1, APEROL), prezzo_cent: 1 }])]);
  const v1 = (await db.query(`select prezzo_cent from public.vendite where id = 'aaaaaaaa-0000-4000-8000-000000000001'`)).rows[0];
  verifica('3 — prezzo letto dal listino', v1?.prezzo_cent === 500, `prezzo_cent=${v1?.prezzo_cent} (atteso 500)`);

  // 4) Rinvio della stessa busta: zero righe nuove.
  const n = (await db.query(`select public.registra_vendite($1::jsonb) as n`,
    [JSON.stringify([riga(1, APEROL)])])).rows[0].n;
  verifica('4 — rinvio idempotente', n === 0, `inserite=${n} (attese 0)`);

  // 5) Offerta con componenti: offerta a 500, componenti a 0, stesso gesto.
  const G = 'bbbbbbbb-0000-4000-8000-0000000000aa';
  await db.query(`select public.registra_vendite($1::jsonb)`, [JSON.stringify([
    riga(10, TRE,      { gesto_id: G }),
    riga(11, POLPETTE, { gesto_id: G, dentro_offerta: true }),
    riga(12, ALICI,    { gesto_id: G, dentro_offerta: true }),
    riga(13, POLENTA,  { gesto_id: G, dentro_offerta: true }),
  ])]);
  const gesto = (await db.query(`select prezzo_cent, dentro_offerta from public.vendite where gesto_id = $1 order by prezzo_cent desc`, [G])).rows;
  verifica('5 — offerta 500 + tre componenti a 0',
    gesto.length === 4 && gesto[0].prezzo_cent === 500 && gesto.slice(1).every((r) => r.prezzo_cent === 0 && r.dentro_offerta),
    `righe=${JSON.stringify(gesto)}`);

  // 5b) Rinvio con tre componenti in piu' sullo stesso gesto: rifiutato, e
  //     il gesto resta a quattro righe (non entrano nemmeno le nuove).
  msg = await fallisce(db, `select public.registra_vendite($1::jsonb)`, [JSON.stringify([
    riga(10, TRE,      { gesto_id: G }),
    riga(11, POLPETTE, { gesto_id: G, dentro_offerta: true }),
    riga(12, ALICI,    { gesto_id: G, dentro_offerta: true }),
    riga(13, POLENTA,  { gesto_id: G, dentro_offerta: true }),
    riga(14, POLPETTE, { gesto_id: G, dentro_offerta: true }),
    riga(15, ALICI,    { gesto_id: G, dentro_offerta: true }),
    riga(16, POLENTA,  { gesto_id: G, dentro_offerta: true }),
  ])]);
  const nGesto = (await db.query(`select count(*)::int as n from public.vendite where gesto_id = $1`, [G])).rows[0].n;
  verifica('5b — gesto gia archiviato non si estende',
    msg?.includes('gia stato usato') && nGesto === 4,
    `${msg ?? 'NESSUNA ECCEZIONE'}; righe del gesto=${nGesto} (attese 4)`);

  // 6) Offerta generica (nessun componente) passa.
  const n6 = (await db.query(`select public.registra_vendite($1::jsonb) as n`,
    [JSON.stringify([riga(20, TRE)])])).rows[0].n;
  verifica('6 — offerta generica accettata', n6 === 1, `inserite=${n6}`);

  // 7) Offerta con due componenti su tre: rifiutata.
  const G7 = 'bbbbbbbb-0000-4000-8000-0000000000bb';
  msg = await fallisce(db, `select public.registra_vendite($1::jsonb)`, [JSON.stringify([
    riga(30, TRE,      { gesto_id: G7 }),
    riga(31, POLPETTE, { gesto_id: G7, dentro_offerta: true }),
    riga(32, ALICI,    { gesto_id: G7, dentro_offerta: true }),
  ])]);
  verifica('7 — offerta a meta rifiutata', msg?.includes('tutti i suoi componenti'), msg ?? 'NESSUNA ECCEZIONE');

  // 8) Componente di tipo non ammesso (spritz dentro «3 cicchetti»): rifiutato.
  const G8 = 'bbbbbbbb-0000-4000-8000-0000000000cc';
  msg = await fallisce(db, `select public.registra_vendite($1::jsonb)`, [JSON.stringify([
    riga(40, TRE,      { gesto_id: G8 }),
    riga(41, APEROL,   { gesto_id: G8, dentro_offerta: true }),
    riga(42, ALICI,    { gesto_id: G8, dentro_offerta: true }),
    riga(43, POLENTA,  { gesto_id: G8, dentro_offerta: true }),
  ])]);
  verifica('8 — componente di tipo non ammesso rifiutato', msg?.includes('tipi ammessi'), msg ?? 'NESSUNA ECCEZIONE');

  // 9) Storno: riga negativa, stesso ordine; secondo storno rifiutato.
  await db.query(`select public.storna_vendite($1::jsonb)`, [JSON.stringify([
    { id: 'cccccccc-0000-4000-8000-000000000001', storna_id: 'aaaaaaaa-0000-4000-8000-000000000001', registrato_il: ORA },
  ])]);
  const s = (await db.query(`select quantita, prezzo_cent, ordine_id from public.vendite where id = 'cccccccc-0000-4000-8000-000000000001'`)).rows[0];
  verifica('9 — storno negativo a prezzo pieno, stesso ordine',
    s && s.quantita === -1 && s.prezzo_cent === 500 && s.ordine_id === 'eeeeeeee-0000-4000-8000-000000000001',
    JSON.stringify(s));
  msg = await fallisce(db, `select public.storna_vendite($1::jsonb)`, [JSON.stringify([
    { id: 'cccccccc-0000-4000-8000-000000000002', storna_id: 'aaaaaaaa-0000-4000-8000-000000000001', registrato_il: ORA },
  ])]);
  verifica('9b — secondo storno della stessa riga rifiutato', msg?.includes('gia stata annullata'), msg ?? 'NESSUNA ECCEZIONE');

  // 9c) L'operatore non annulla una riga del capo. auth.uid() si sposta
  //     sull'altro utente e poi torna: e' impalcatura, non schema.
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable
                 as $$ select '${ALTRO_UTENTE}'::uuid $$;`);
  msg = await fallisce(db, `select public.storna_vendite($1::jsonb)`, [JSON.stringify([
    { id: 'cccccccc-0000-4000-8000-000000000003', storna_id: 'aaaaaaaa-0000-4000-8000-000000000020', registrato_il: ORA },
  ])]);
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable
                 as $$ select '${UTENTE_PROVA}'::uuid $$;`);
  verifica('9c — l operatore non annulla righe altrui', msg?.includes('proprie righe'), msg ?? 'NESSUNA ECCEZIONE');

  // 10) Chiusa: niente vendite.
  await db.query(`select public.chiudi_edizione()`);
  msg = await fallisce(db, `select public.registra_vendite($1::jsonb)`, [JSON.stringify([riga(50, APEROL)])]);
  verifica('10 — a edizione chiusa non si registra', msg?.includes('nessuna edizione aperta'), msg ?? 'NESSUNA ECCEZIONE');

  // 11) Copia menu: la nuova edizione ha le 7 voci.
  await db.exec(`insert into public.edizioni (id, anno, nome) values ('5e5510e0-0000-4000-8000-000000000027', 2027, 'Sagra 2027');`);
  await db.query(`select public.copia_menu($1::uuid, $2::uuid)`, [EDIZIONE, '5e5510e0-0000-4000-8000-000000000027']);
  const copiati = (await db.query(`select count(*)::int as n from public.prodotti where edizione_id = '5e5510e0-0000-4000-8000-000000000027'`)).rows[0].n;
  verifica('11 — copia menu', copiati === 7, `copiati=${copiati} (attesi 7)`);

  // 12) Un solo capo.
  msg = await fallisce(db, `update public.profiles set role = 'capo' where id = $1`, [ALTRO_UTENTE]);
  verifica('12 — secondo capo rifiutato', msg?.includes('gia un capo'), msg ?? 'NESSUNA ECCEZIONE');

  // main() legge il verdetto da qui.
  return esiti.every((e) => e.passata);
}

// ---------------------------------------------------------------------------
// Programma
// ---------------------------------------------------------------------------
async function main() {
  const db = new PGlite();
  await db.waitReady;

  const versione = (await db.query('select version()')).rows[0].version;
  console.log(`PGlite pronto — ${versione}`);
  console.log('');

  console.log('Preludio (impalcatura di verifica, non una migrazione)');
  console.log('-----------------------------------------------------');
  try {
    await db.exec(PRELUDIO);
    console.log(ok('ruoli anon/authenticated/service_role, schema auth, auth.users, auth.uid()'));
  } catch (err) {
    stampaErrorePostgres('preludio', PRELUDIO, err);
    return 1;
  }

  const file = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort();

  if (file.length === 0) {
    console.error(`Nessun file .sql in ${MIGRATIONS_DIR}`);
    return 1;
  }

  console.log('');
  console.log(`Migrazioni da ${MIGRATIONS_DIR} (${file.length} file)`);
  console.log('-----------------------------------------------------');

  for (const nome of file) {
    const sql = await readFile(join(MIGRATIONS_DIR, nome), 'utf8');
    try {
      await db.exec(sql);
      console.log(ok(nome));
    } catch (err) {
      console.log(ko(nome));
      stampaErrorePostgres(nome, sql, err);
      console.error('Verifica interrotta al primo errore. Migrazioni successive non eseguite.');
      return 1;
    }
  }

  let tutteVerdi = false;
  try {
    tutteVerdi = await provaFunzionale(db);
  } catch (err) {
    stampaErrorePostgres('prova funzionale', '', err);
    return 1;
  }

  console.log('');
  if (tutteVerdi) {
    console.log(`Tutto verde: ${file.length} migrazioni applicate, ${esiti.length} verifiche funzionali passate.`);
    return 0;
  }
  const fallite = esiti.filter((e) => !e.passata);
  console.error(`Migrazioni applicate, ma ${fallite.length} verifiche funzionali su ${esiti.length} sono fallite:`);
  for (const f of fallite) console.error(`  - ${f.nome}: ${f.dettaglio}`);
  return 1;
}

// Si usa process.exitCode e non process.exit(): terminare di forza mentre il
// modulo WebAssembly di PGlite ha ancora handle aperti fa abortire libuv su
// Windows, e un abort maschera il codice di uscita che ci interessa.
main()
  .then((codice) => { process.exitCode = codice; })
  .catch((err) => {
    console.error('Errore inatteso:', err);
    process.exitCode = 1;
  });
