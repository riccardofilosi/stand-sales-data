-- 018_registrazione_con_approvazione.sql
--
-- Decisione 32: le registrazioni si riaprono, ma un nuovo iscritto non e'
-- nessuno finche' il gestore non lo approva dall'app (Configurazione ->
-- Operatori). Prima gli account li creava solo il gestore dal pannello di
-- Supabase; ora chiunque trovi l'indirizzo puo' registrarsi, quindi il ruolo
-- di nascita deve valere zero: niente letture, niente scritture. Il modello
-- di minaccia resta quello dichiarato — chi trova l'indirizzo — e la
-- registrazione aperta non gli regala piu' di quanto avesse prima.
--
-- ATTENZIONE al pacchetto in transazione unica: il valore nuovo dell'enum si
-- puo' AGGIUNGERE dentro la transazione ma non USARE come letterale nella
-- stessa. Qui non viene mai usato: i corpi di funzione sono testo, valutato
-- solo a chiamata. Nessun insert o confronto con 'in_attesa' in questo file.

-- 1) Il ruolo di parcheggio.
alter type public.user_role add value if not exists 'in_attesa';

-- 2) Operativo = approvato. E' il fratello di is_gestore(): la coppia di
--    ruoli che puo' toccare la serata. `in_attesa` resta fuori da entrambe.
create or replace function public.is_operativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('gestore', 'operatore') from public.profiles where id = auth.uid()),
    false
  )
$$;

revoke execute on function public.is_operativo() from public, anon;
grant  execute on function public.is_operativo() to authenticated;

-- 3) Ogni nuovo utente nasce in attesa. Il ruolo continua a NON venire mai
--    letto dai metadati di registrazione: sarebbe una scalata di privilegi a
--    costo zero. Vale anche per gli account creati dal pannello di Supabase:
--    pure quelli passano dall'approvazione in app.
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
    'in_attesa'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4) La guardia sul denaro. registra_movimenti() e storna_movimenti()
--    controllano solo che l'utente sia autenticato, perche' quando sono nate
--    ogni autenticato era gia' stato creato a mano dal gestore. Con le
--    registrazioni aperte non basta piu'. Il controllo sta su un trigger di
--    movimenti invece che dentro le due funzioni: cosi' copre anche qualunque
--    percorso futuro verso la tabella, e non riscrive trecento righe gia'
--    collaudate.
--
--    `auth.uid() is not null` come precondizione: il pannello di Supabase e
--    le migrazioni lavorano senza JWT (uid nullo) e devono poter continuare a
--    scrivere — per loro non cambia niente. Gli autenticati non approvati
--    sono gli unici a cadere qui.
create or replace function public.rifiuta_non_operativi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_operativo() then
    raise exception 'utente non ancora approvato dal gestore';
  end if;
  return new;
end;
$$;

drop trigger if exists movimenti_solo_operativi on public.movimenti;
create trigger movimenti_solo_operativi
  before insert on public.movimenti
  for each row execute function public.rifiuta_non_operativi();

-- 5) Le letture si stringono. `using (true)` era giusto quando ogni
--    autenticato era un operatore scelto dal gestore; ora un autenticato puo'
--    essere chiunque, e l'incasso della serata non e' cosa sua. La select su
--    profiles non si tocca: ognuno vede la propria riga, che serve all'app
--    per capire di essere in attesa.
drop policy sessioni_select on public.sessioni;
create policy sessioni_select on public.sessioni
  for select to authenticated using (public.is_operativo());

drop policy categorie_select on public.categorie;
create policy categorie_select on public.categorie
  for select to authenticated using (public.is_operativo());

drop policy sottocategorie_select on public.sottocategorie;
create policy sottocategorie_select on public.sottocategorie
  for select to authenticated using (public.is_operativo());

drop policy prodotti_select on public.prodotti;
create policy prodotti_select on public.prodotti
  for select to authenticated using (public.is_operativo());

drop policy offerte_select on public.offerte;
create policy offerte_select on public.offerte
  for select to authenticated using (public.is_operativo());

drop policy offerte_componenti_select on public.offerte_componenti;
create policy offerte_componenti_select on public.offerte_componenti
  for select to authenticated using (public.is_operativo());

drop policy categorie_costo_select on public.categorie_costo;
create policy categorie_costo_select on public.categorie_costo
  for select to authenticated using (public.is_operativo());

drop policy movimenti_select on public.movimenti;
create policy movimenti_select on public.movimenti
  for select to authenticated using (public.is_operativo());

drop policy acquisti_select on public.acquisti;
create policy acquisti_select on public.acquisti
  for select to authenticated using (public.is_operativo());

-- 6) La vista dei nomi si restringe allo stesso modo. Non applica la RLS di
--    profiles (security_invoker resta spento apposta), quindi il filtro va
--    scritto qui: gli approvati vedono i nomi, chi e' in attesa vede solo se
--    stesso.
create or replace view public.operatori with (security_invoker = off) as
  select id, nome from public.profiles
  where public.is_operativo() or id = auth.uid();

-- L'approvazione non ha bisogno di una funzione nuova: e' un UPDATE di
-- profiles.role, che la policy profiles_update (003) riserva gia' al gestore.
