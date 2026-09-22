-- 003_ruoli_e_rls.sql

-- Nota: non chiamare questa funzione `current_role`, che è una parola
-- riservata di Postgres.
create or replace function public.mio_ruolo()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_gestore()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'gestore' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Ogni nuovo utente nasce operatore. Il ruolo NON viene mai letto dai
-- metadati inviati in fase di registrazione: sarebbe una scalata di
-- privilegi a costo zero.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles        enable row level security;
alter table public.events          enable row level security;
alter table public.products        enable row level security;
alter table public.price_history   enable row level security;
alter table public.offers          enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.cost_categories enable row level security;
alter table public.supplies        enable row level security;
alter table public.purchases       enable row level security;
alter table public.pending_changes enable row level security;
alter table public.audit_log       enable row level security;

-- Nessuno inserisce vendite direttamente: si passa da registra_vendita().
revoke insert, update, delete on public.sales      from anon, authenticated;
revoke insert, update, delete on public.sale_items from anon, authenticated;

-- Lo storico prezzi si chiude, non si cancella.
revoke delete on public.price_history from anon, authenticated;

-- Il registro di audit è scritto solo dai trigger.
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- Nessun accesso anonimo a nulla.
revoke all on all tables in schema public from anon;
revoke truncate on public.sales, public.sale_items, public.audit_log from anon, authenticated;

-- I privilegi di default valgono per chi crea l'oggetto: senza "for role postgres"
-- una tabella creata da un altro ruolo sfuggirebbe alla regola.
alter default privileges for role postgres in schema public revoke all     on tables    from anon;
alter default privileges for role postgres in schema public revoke all     on sequences from anon;
-- Le funzioni nascono eseguibili da PUBLIC, e anon ne fa parte: una futura
-- funzione security definer sarebbe chiamabile via /rpc/ da chiunque abbia la chiave anon.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

revoke execute on function public.mio_ruolo()  from public, anon;
revoke execute on function public.is_gestore() from public, anon;
grant  execute on function public.mio_ruolo()  to authenticated;
grant  execute on function public.is_gestore() to authenticated;

-- La RLS filtra le righe, non le colonne: senza questo, la stessa UPDATE che
-- approva una richiesta potrebbe riscriverne il payload.
revoke update on public.pending_changes from authenticated;
grant  update (stato, deciso_da, deciso_at, motivo_rifiuto)
  on public.pending_changes to authenticated;

-- profiles: ognuno vede sé stesso, il gestore vede tutti.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_gestore());

-- Solo il gestore cambia i ruoli.
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

-- Anagrafiche: tutti leggono (servono per disegnare i bottoni),
-- solo il gestore scrive.
create policy events_select on public.events
  for select to authenticated using (true);
create policy events_write on public.events
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy products_select on public.products
  for select to authenticated using (true);
create policy products_write on public.products
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy prices_select on public.price_history
  for select to authenticated using (true);
create policy prices_write on public.price_history
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy offers_select on public.offers
  for select to authenticated using (true);
create policy offers_write on public.offers
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

-- Vendite: tutti leggono (serve al realtime della cassa condivisa).
-- Non esiste policy di scrittura perché il privilegio è revocato.
create policy sales_select on public.sales
  for select to authenticated using (true);
create policy sale_items_select on public.sale_items
  for select to authenticated using (true);

-- Costi e acquisti: tutti leggono e registrano, solo il gestore corregge.
create policy cost_categories_select on public.cost_categories
  for select to authenticated using (true);
create policy cost_categories_write on public.cost_categories
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy supplies_select on public.supplies
  for select to authenticated using (true);
create policy supplies_write on public.supplies
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy purchases_select on public.purchases
  for select to authenticated using (true);
create policy purchases_insert on public.purchases
  for insert to authenticated
  with check (operator_id = auth.uid());
create policy purchases_modify on public.purchases
  for update to authenticated
  using (public.is_gestore()) with check (public.is_gestore());
create policy purchases_delete on public.purchases
  for delete to authenticated using (public.is_gestore());

-- Approvazioni: chiunque chiede, solo il gestore decide.
create policy pending_select on public.pending_changes
  for select to authenticated using (true);
-- Il gestore non passa dalla coda: le sue modifiche si applicano subito
-- (vedi spec, sezione 2). Se ci passasse, la regola "chi decide non e' chi
-- ha chiesto" lo bloccherebbe, non essendoci un secondo gestore.
create policy pending_insert on public.pending_changes
  for insert to authenticated
  with check (richiesto_da = auth.uid() and stato = 'pending' and not public.is_gestore());

create policy pending_decide on public.pending_changes
  for update to authenticated
  using (public.is_gestore())
  with check (public.is_gestore() and deciso_da = auth.uid());

-- Audit: solo il gestore legge. Nessuno scrive.
create policy audit_select on public.audit_log
  for select to authenticated using (public.is_gestore());

-- Espone soltanto id e nome. La vista non applica la RLS di profiles
-- (security_invoker disattivato), ma non seleziona la colonna role.
create view public.operatori with (security_invoker = off) as
  select id, nome from public.profiles;

revoke all    on public.operatori from anon;
grant  select on public.operatori to authenticated;
