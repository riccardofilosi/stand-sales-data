-- 024_ricostruzione.sql
--
-- La sagra e' una sera l'anno: menu il giorno prima, cassa la sera, andamento
-- dopo. Tutto il resto dello schema (acquisti, audit, quattro ruoli,
-- approvazione, insiemi, offerte a componenti) era peso che non serviva a
-- questo. Si demolisce e si rifa' a tre tabelle piu' i profili.
--
-- I dati di prova esistenti si perdono: voluto (pulizia-collaudo era gia'
-- passata). Nessun backup dentro la transazione.

-- ---------------------------------------------------------------------------
-- 1) Demolizione
-- ---------------------------------------------------------------------------
drop table if exists public.movimenti          cascade;
drop table if exists public.acquisti           cascade;
drop table if exists public.offerte_componenti cascade;
drop table if exists public.offerte            cascade;
drop table if exists public.prodotti           cascade;
drop table if exists public.sottocategorie     cascade;
drop table if exists public.sessioni           cascade;
drop table if exists public.audit_log          cascade;

-- La vista dei nomi (018) e il trigger di audit sui profili (005) tengono in
-- piedi is_operativo() e scrivi_audit(): vanno giu' prima delle funzioni.
drop view    if exists public.operatori;
drop trigger if exists audit_profiles on public.profiles;

drop function if exists public.registra_movimenti(jsonb);
drop function if exists public.storna_movimenti(jsonb);
drop function if exists public.apri_sessione(uuid);
drop function if exists public.chiudi_sessione();
drop function if exists public.copia_catalogo(uuid, uuid);
drop function if exists public.stato_operatori();
drop function if exists public.is_gestore();
drop function if exists public.is_operativo();
drop function if exists public.rifiuta_non_operativi();
drop function if exists public.scrivi_audit();
drop function if exists public.sessioni_insiemi_fissi();
drop function if exists public.offerte_componenti_stessa_sessione();
drop function if exists public.colonna_immutabile();
-- Restituisce user_role: senza toglierla l'enum vecchio non si butta.
drop function if exists public.mio_ruolo();

-- ---------------------------------------------------------------------------
-- 2) Due ruoli. L'enum vecchio ha quattro valori e Postgres non sa toglierne:
--    si crea il tipo nuovo, si travasa, si butta il vecchio.
--    consigliere e in_attesa diventano operatore: chi era dentro resta dentro.
-- ---------------------------------------------------------------------------
create type public.ruolo as enum ('capo', 'operatore');

-- Il trigger della 019 e' legato alla colonna: Postgres non cambia il tipo di
-- una colonna citata da un trigger. Giu' prima, ricreato subito dopo.
drop trigger if exists profiles_un_solo_capo on public.profiles;

alter table public.profiles
  alter column role drop default;
alter table public.profiles
  alter column role type public.ruolo
  using (case when role::text = 'capo' then 'capo' else 'operatore' end)::public.ruolo;
alter table public.profiles
  alter column role set default 'operatore';

drop type if exists public.user_role;

-- Uno solo. Trigger e non indice parziale per lo stesso motivo della 019:
-- il predicato di un indice deve essere immutable e un enum appena creato
-- dentro la transazione non si puo' nominare come letterale.
create or replace function public.un_solo_capo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role::text = 'capo' and exists (
    select 1 from public.profiles where role::text = 'capo' and id <> new.id
  ) then
    raise exception 'c e gia un capo: prima va tolto a chi lo ha adesso';
  end if;
  return new;
end;
$$;

create trigger profiles_un_solo_capo
  before insert or update of role on public.profiles
  for each row execute function public.un_solo_capo();

create or replace function public.is_capo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role::text = 'capo' from public.profiles where id = auth.uid()),
    false
  )
$$;
revoke execute on function public.is_capo() from public, anon;
grant  execute on function public.is_capo() to authenticated;

-- Nuovo iscritto = operatore subito. Il ruolo non si legge MAI dai metadati
-- di registrazione (sarebbe una scalata a costo zero); il nome si'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, role)
  values (
    new.id,
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data->>'nome', '')), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Senza nome'
    ),
    'operatore'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_capo()) with check (public.is_capo());

-- ---------------------------------------------------------------------------
-- 3) Edizioni. Una per anno; una sola aperta per volta.
-- ---------------------------------------------------------------------------
create table public.edizioni (
  id         uuid primary key default gen_random_uuid(),
  anno       int  not null unique,
  nome       text not null,
  stato      text not null default 'bozza'
             check (stato in ('bozza', 'aperta', 'chiusa')),
  aperta_il  timestamptz,
  chiusa_il  timestamptz,
  created_at timestamptz not null default now()
);

create unique index edizioni_una_sola_aperta
  on public.edizioni (stato) where stato = 'aperta';

-- ---------------------------------------------------------------------------
-- 4) Prodotti: lista unica per edizione. Un'offerta e' un prodotto di tipo
--    'offerta' con in piu' quanti pezzi si scelgono e di che tipo.
-- ---------------------------------------------------------------------------
create table public.prodotti (
  id           uuid primary key default gen_random_uuid(),
  edizione_id  uuid not null references public.edizioni(id) on delete cascade,
  nome         text not null,
  tipo         text not null check (tipo in ('cibo', 'bevanda', 'offerta')),
  -- Nullo si tollera in bozza: apri_edizione() rifiuta finche' ce n'e' uno.
  prezzo_cent  int check (prezzo_cent > 0),
  colore       text not null,
  ordine       int  not null default 0,
  -- Le sarde finiscono: si nasconde, non si cancella (le vendite lo citano).
  nascosto     boolean not null default false,
  -- Solo offerte: quanti componenti si scelgono e fra quali tipi.
  pezzi_scelta int check (pezzi_scelta > 0),
  tipi_scelta  text[],
  unique (edizione_id, nome),
  constraint prodotti_colore_formato check (colore ~ '^#[0-9A-Fa-f]{6}$'),
  constraint prodotti_offerta_coerente check (
    (tipo = 'offerta' and pezzi_scelta is not null and tipi_scelta is not null
       and cardinality(tipi_scelta) > 0 and tipi_scelta <@ array['cibo', 'bevanda'])
    or
    (tipo <> 'offerta' and pezzi_scelta is null and tipi_scelta is null)
  )
);

create index prodotti_per_edizione on public.prodotti (edizione_id, ordine);

-- ---------------------------------------------------------------------------
-- 5) Vendite. Una riga per pezzo. Lo storno e' una riga negativa che punta
--    all'originale. Nessuna cascata dall'edizione: un'edizione con vendite
--    dentro non si cancella.
-- ---------------------------------------------------------------------------
create table public.vendite (
  -- Nessun default: lo genera il telefono prima di accodare, cosi' il
  -- rinvio della stessa busta non duplica (chiave primaria = ricevuta).
  id             uuid primary key,
  edizione_id    uuid not null references public.edizioni(id),
  prodotto_id    uuid not null references public.prodotti(id),
  -- Negativa solo sugli storni. sum(quantita) = pezzi netti,
  -- sum(quantita * prezzo_cent) = incasso netto, senza casi speciali.
  quantita       int  not null check (quantita <> 0),
  -- Congelato al momento della vendita. Zero per i componenti scelti
  -- dentro un'offerta: il prezzo lo porta la riga dell'offerta.
  prezzo_cent    int  not null check (prezzo_cent >= 0),
  -- Le righe di un cliente (tre spritz, due cicchetti, un'offerta).
  ordine_id      uuid not null,
  -- Le righe di un gesto: l'offerta e i suoi componenti.
  gesto_id       uuid not null,
  dentro_offerta boolean not null default false,
  operatore_id   uuid not null references public.profiles(id),
  -- Ora del dispositivo al tocco, non ora di arrivo.
  registrato_il  timestamptz not null,
  ricevuto_il    timestamptz not null default now(),
  storna_id      uuid references public.vendite(id),
  constraint niente_autostorno check (storna_id is null or storna_id <> id)
);

create index vendite_per_edizione on public.vendite (edizione_id, registrato_il);
create index vendite_per_gesto    on public.vendite (gesto_id);
create index vendite_per_ordine   on public.vendite (ordine_id);

-- Una riga si storna una volta sola.
create unique index vendite_uno_storno_per_riga
  on public.vendite (storna_id) where storna_id is not null;

-- ---------------------------------------------------------------------------
-- 6) RLS. Tutti gli autenticati leggono tutto. Il capo scrive edizioni e
--    prodotti. Le vendite si scrivono SOLO dalle funzioni.
-- ---------------------------------------------------------------------------
alter table public.edizioni enable row level security;
alter table public.prodotti enable row level security;
alter table public.vendite  enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.vendite from anon, authenticated;

create policy edizioni_select on public.edizioni
  for select to authenticated using (true);
create policy edizioni_write on public.edizioni
  for all to authenticated
  using (public.is_capo()) with check (public.is_capo());

create policy prodotti_select on public.prodotti
  for select to authenticated using (true);
create policy prodotti_write on public.prodotti
  for all to authenticated
  using (public.is_capo()) with check (public.is_capo());

create policy vendite_select on public.vendite
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 7) Apertura, chiusura, copia del menu.
-- ---------------------------------------------------------------------------
create or replace function public.apri_edizione(p_edizione uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_capo() then
    raise exception 'solo il capo apre un edizione';
  end if;
  if not exists (select 1 from public.edizioni where id = p_edizione) then
    raise exception 'edizione inesistente';
  end if;
  if exists (select 1 from public.edizioni where stato = 'aperta' and id <> p_edizione) then
    raise exception 'un altra edizione e gia aperta: chiuderla prima';
  end if;
  if not exists (
    select 1 from public.prodotti where edizione_id = p_edizione and not nascosto
  ) then
    raise exception 'il menu e vuoto: l edizione non si apre';
  end if;
  if exists (
    select 1 from public.prodotti
    where edizione_id = p_edizione and not nascosto and prezzo_cent is null
  ) then
    raise exception 'ci sono voci senza prezzo: l edizione non si apre';
  end if;

  update public.edizioni
     set stato = 'aperta', aperta_il = coalesce(aperta_il, now()), chiusa_il = null
   where id = p_edizione;
end;
$$;

create or replace function public.chiudi_edizione()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_capo() then
    raise exception 'solo il capo chiude un edizione';
  end if;
  update public.edizioni set stato = 'chiusa', chiusa_il = now() where stato = 'aperta';
  if not found then
    raise exception 'nessuna edizione aperta';
  end if;
end;
$$;

-- I prodotti nascosti non si copiano: erano finiti o ritirati.
create or replace function public.copia_menu(p_da uuid, p_a uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_capo() then
    raise exception 'solo il capo copia un menu';
  end if;
  if (select stato from public.edizioni where id = p_a) <> 'bozza' then
    raise exception 'si copia solo dentro un edizione in preparazione';
  end if;
  if exists (select 1 from public.prodotti where edizione_id = p_a) then
    raise exception 'l edizione di destinazione ha gia un menu';
  end if;

  insert into public.prodotti
    (edizione_id, nome, tipo, prezzo_cent, colore, ordine, pezzi_scelta, tipi_scelta)
  select p_a, nome, tipo, prezzo_cent, colore, ordine, pezzi_scelta, tipi_scelta
  from public.prodotti where edizione_id = p_da and not nascosto;
end;
$$;

revoke execute on function public.apri_edizione(uuid)    from public, anon;
revoke execute on function public.chiudi_edizione()      from public, anon;
revoke execute on function public.copia_menu(uuid, uuid) from public, anon;
grant  execute on function public.apri_edizione(uuid)    to authenticated;
grant  execute on function public.chiudi_edizione()      to authenticated;
grant  execute on function public.copia_menu(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) registra_vendite: un gesto o piu' gesti di un cliente, in un lotto.
--
-- Formato:
-- [{"id":"uuid","prodotto_id":"uuid","quantita":1,"gesto_id":"uuid",
--   "ordine_id":"uuid","dentro_offerta":false,
--   "registrato_il":"2026-09-12T21:04:12.345Z"}]
--
-- Il client non manda prezzi: si leggono qui dal listino. Le righe con
-- dentro_offerta valgono zero e devono stare nel gesto di una riga offerta.
-- ---------------------------------------------------------------------------
create or replace function public.registra_vendite(p_righe jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edizione  uuid;
  v_aperta_il timestamptz;
  v_inserite  int;
begin
  if auth.uid() is null then
    raise exception 'non autenticato';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'nessuna riga da registrare';
  end if;

  select id, aperta_il into v_edizione, v_aperta_il
  from public.edizioni where stato = 'aperta';
  if v_edizione is null then
    raise exception 'nessuna edizione aperta';
  end if;

  -- La quantita' e' l'unica leva del client: intera, positiva, con un tetto.
  -- Si legge come numeric e si pretende intera, cosi' "1.5" da' questo
  -- messaggio e non l'errore di cast del ::int piu' sotto.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where coalesce(nullif(r->>'quantita', '')::numeric, 0) not between 1 and 99
       or (r->>'quantita')::numeric <> floor((r->>'quantita')::numeric)
  ) then
    raise exception 'quantita fuori intervallo (1-99)';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'id', '') is null
       or nullif(r->>'registrato_il', '') is null
       or nullif(r->>'gesto_id', '') is null
       or nullif(r->>'ordine_id', '') is null
  ) then
    raise exception 'una riga non porta id, ora, gesto o ordine';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    group by (r->>'id')::uuid having count(*) > 1
  ) then
    raise exception 'la stessa riga compare due volte nel lotto';
  end if;

  -- Un gesto non attraversa due buste e non si estende: se in archivio c'e'
  -- gia' una riga di un gesto del lotto, allora OGNI riga del lotto con quel
  -- gesto deve essere gia' in archivio (rinvio puro). Altrimenti qualcuno
  -- sta riusando un gesto o gli sta appendendo componenti a prezzo zero.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where exists (
        select 1 from public.vendite v where v.gesto_id = (r->>'gesto_id')::uuid)
      and not exists (
        select 1 from public.vendite v where v.id = (r->>'id')::uuid)
  ) then
    raise exception 'il gesto di una riga e gia stato usato';
  end if;

  -- Prodotti esistenti, di questa edizione. I nascosti si accettano: una
  -- riga in coda dalle 21:28 deve arrivare anche se alle 21:35 le sarde
  -- sono state nascoste.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    left join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    where p.id is null or p.edizione_id <> v_edizione
  ) then
    raise exception 'una riga cita un prodotto inesistente o di un altra edizione';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    where p.prezzo_cent is null
  ) then
    raise exception 'una riga cita una voce senza prezzo';
  end if;

  -- Un componente (dentro_offerta) vale un pezzo e sta nel gesto di UNA riga
  -- di tipo offerta; un'offerta non e' componente di se stessa.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    where coalesce((r->>'dentro_offerta')::boolean, false)
      and (p.tipo = 'offerta' or coalesce((r->>'quantita')::int, 1) <> 1)
  ) then
    raise exception 'un componente vale un pezzo e non e un offerta';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where coalesce((r->>'dentro_offerta')::boolean, false)
      and (
        select count(*) from jsonb_array_elements(p_righe) o
        join public.prodotti po on po.id = (o->>'prodotto_id')::uuid
        where (o->>'gesto_id') = (r->>'gesto_id') and po.tipo = 'offerta'
      ) <> 1
  ) then
    raise exception 'un componente deve stare nel gesto di una sola offerta';
  end if;

  -- Componenti: tipo ammesso, e o nessuno (offerta generica) o esattamente
  -- pezzi_scelta * quantita dell'offerta.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) o
    join public.prodotti po on po.id = (o->>'prodotto_id')::uuid and po.tipo = 'offerta'
    where (
      select count(*) from jsonb_array_elements(p_righe) c
      join public.prodotti pc on pc.id = (c->>'prodotto_id')::uuid
      where (c->>'gesto_id') = (o->>'gesto_id')
        and coalesce((c->>'dentro_offerta')::boolean, false)
        and not (pc.tipo = any (po.tipi_scelta))
    ) > 0
  ) then
    raise exception 'un componente non e fra i tipi ammessi dall offerta';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) o
    join public.prodotti po on po.id = (o->>'prodotto_id')::uuid and po.tipo = 'offerta'
    where (
      select count(*) from jsonb_array_elements(p_righe) c
      where (c->>'gesto_id') = (o->>'gesto_id')
        and coalesce((c->>'dentro_offerta')::boolean, false)
    ) not in (0, po.pezzi_scelta * coalesce((o->>'quantita')::int, 1))
  ) then
    raise exception 'un offerta si registra con tutti i suoi componenti o con nessuno';
  end if;

  insert into public.vendite (
    id, edizione_id, prodotto_id, quantita, prezzo_cent,
    ordine_id, gesto_id, dentro_offerta, operatore_id, registrato_il
  )
  select
    (r->>'id')::uuid,
    v_edizione,
    p.id,
    (r->>'quantita')::int,
    case when coalesce((r->>'dentro_offerta')::boolean, false) then 0 else p.prezzo_cent end,
    (r->>'ordine_id')::uuid,
    (r->>'gesto_id')::uuid,
    coalesce((r->>'dentro_offerta')::boolean, false),
    auth.uid(),
    -- Morsa: non nel futuro, non prima dell'apertura.
    greatest(
      least((r->>'registrato_il')::timestamptz, now()),
      coalesce(v_aperta_il, '-infinity'::timestamptz)
    )
  from jsonb_array_elements(p_righe) r
  join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
  -- Il rinvio della stessa busta non entra due volte.
  on conflict (id) do nothing;

  get diagnostics v_inserite = row_count;
  return v_inserite;
end;
$$;

revoke execute on function public.registra_vendite(jsonb) from public, anon;
grant  execute on function public.registra_vendite(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) storna_vendite: righe speculari negative.
-- Formato: [{"id":"uuid nuovo","storna_id":"uuid","registrato_il":"..."}]
-- ---------------------------------------------------------------------------
create or replace function public.storna_vendite(p_righe jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edizione  uuid;
  v_aperta_il timestamptz;
  v_inserite  int;
begin
  if auth.uid() is null then
    raise exception 'non autenticato';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'nessuna riga da stornare';
  end if;

  select id, aperta_il into v_edizione, v_aperta_il
  from public.edizioni where stato = 'aperta';
  if v_edizione is null then
    raise exception 'nessuna edizione aperta';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'registrato_il', '') is null
  ) then
    raise exception 'una riga non porta l ora del tocco';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    left join public.vendite v on v.id = (r->>'storna_id')::uuid
    where v.id is null
  ) then
    raise exception 'una riga da stornare non esiste';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    join public.vendite v on v.id = (r->>'storna_id')::uuid
    where v.edizione_id <> v_edizione
  ) then
    raise exception 'si annulla solo dentro l edizione aperta';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    join public.vendite v on v.id = (r->>'storna_id')::uuid
    where v.storna_id is not null
  ) then
    raise exception 'uno storno non si storna';
  end if;

  -- Ognuno annulla le proprie righe; il capo quelle di chiunque.
  if not public.is_capo() and exists (
    select 1 from jsonb_array_elements(p_righe) r
    join public.vendite v on v.id = (r->>'storna_id')::uuid
    where v.operatore_id <> auth.uid()
  ) then
    raise exception 'si annullano solo le proprie righe';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    join public.vendite v on v.storna_id = (r->>'storna_id')::uuid
  ) then
    raise exception 'una riga indicata e gia stata annullata';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    group by (r->>'storna_id')::uuid having count(*) > 1
  ) then
    raise exception 'la stessa riga compare due volte fra gli annulli';
  end if;

  insert into public.vendite (
    id, edizione_id, prodotto_id, quantita, prezzo_cent,
    ordine_id, gesto_id, dentro_offerta, operatore_id, registrato_il, storna_id
  )
  select
    (r->>'id')::uuid,
    v.edizione_id,
    v.prodotto_id,
    -v.quantita,
    v.prezzo_cent,
    v.ordine_id,
    -- Lo storno fa gesto da solo.
    (r->>'id')::uuid,
    v.dentro_offerta,
    auth.uid(),
    greatest(
      least((r->>'registrato_il')::timestamptz, now()),
      coalesce(v_aperta_il, '-infinity'::timestamptz)
    ),
    v.id
  from jsonb_array_elements(p_righe) r
  join public.vendite v on v.id = (r->>'storna_id')::uuid
  on conflict (id) do nothing;

  get diagnostics v_inserite = row_count;
  return v_inserite;
end;
$$;

revoke execute on function public.storna_vendite(jsonb) from public, anon;
grant  execute on function public.storna_vendite(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Realtime: vendite (andamento) ed edizioni (la cassa si accorge della
--     chiusura). Condizionato: su PGlite la pubblicazione non esiste.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime non esiste qui: niente da iscrivere';
    return;
  end if;
  alter publication supabase_realtime add table public.vendite;
  alter publication supabase_realtime add table public.edizioni;
end;
$$;
