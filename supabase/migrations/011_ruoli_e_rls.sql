-- 011_ruoli_e_rls.sql
-- Il telefono non e' mai l'autorita'. Ogni regola che conta sta qui, non
-- nell'interfaccia: l'interfaccia si puo' aggirare con la chiave anon e curl.

alter table public.sessioni           enable row level security;
alter table public.categorie          enable row level security;
alter table public.sottocategorie     enable row level security;
alter table public.prodotti           enable row level security;
alter table public.offerte            enable row level security;
alter table public.offerte_componenti enable row level security;
alter table public.movimenti          enable row level security;
alter table public.categorie_costo    enable row level security;
alter table public.acquisti           enable row level security;

-- Nessuno scrive movimenti a mano: si passa da registra_movimenti() e
-- storna_movimenti(), che leggono i prezzi dal listino e li impongono.
-- Senza questo, un operatore registrerebbe un aperol a un centesimo.
revoke insert, update, delete on public.movimenti from anon, authenticated;

-- Un movimento non si corregge: si storna. La riga sbagliata resta accanto
-- alla sua correzione, ed e' l'unico modo per accorgersi di un ammanco.
revoke truncate on public.movimenti from anon, authenticated;

revoke all on all tables in schema public from anon;

-- Anagrafiche: tutti leggono, perche' servono a disegnare i bottoni.
-- Solo il gestore scrive: le decisioni si prendono prima della serata.
create policy sessioni_select on public.sessioni
  for select to authenticated using (true);
create policy sessioni_write on public.sessioni
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy categorie_select on public.categorie
  for select to authenticated using (true);
create policy categorie_write on public.categorie
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy sottocategorie_select on public.sottocategorie
  for select to authenticated using (true);
create policy sottocategorie_write on public.sottocategorie
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy prodotti_select on public.prodotti
  for select to authenticated using (true);
create policy prodotti_write on public.prodotti
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy offerte_select on public.offerte
  for select to authenticated using (true);
create policy offerte_write on public.offerte
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy offerte_componenti_select on public.offerte_componenti
  for select to authenticated using (true);
create policy offerte_componenti_write on public.offerte_componenti
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

create policy categorie_costo_select on public.categorie_costo
  for select to authenticated using (true);
create policy categorie_costo_write on public.categorie_costo
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());

-- Adesso e' in sola lettura per tutti: chi sta al banco vede se la serata gira
-- e smette di chiederlo. Non esiste policy di scrittura perche' il privilegio
-- e' revocato sopra.
create policy movimenti_select on public.movimenti
  for select to authenticated using (true);

-- Gli acquisti li registra il gestore, e restano scrivibili anche a sessione
-- chiusa: una fattura arriva quando arriva.
create policy acquisti_select on public.acquisti
  for select to authenticated using (true);
create policy acquisti_write on public.acquisti
  for all to authenticated
  using (public.is_gestore()) with check (public.is_gestore());
