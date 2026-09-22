-- 016_realtime.sql
-- Adesso deve aggiornarsi da solo su tutti i telefoni (decisioni 15 e 27), e
-- la cassa deve accorgersi che qualcun altro ha chiuso la sessione. Nessuna
-- delle due cose e' codice dell'app: e' l'iscrizione delle tabelle alla
-- pubblicazione che Supabase legge per mandare gli eventi ai client.
--
-- Il blocco e' condizionato perche' `supabase_realtime` esiste su Supabase e
-- non su un Postgres qualunque: la verifica delle migrazioni gira su PGlite,
-- dove la pubblicazione non c'e' e un `alter publication` secco farebbe
-- fallire tutto. Il `if not exists` sulle singole tabelle serve al riavvio:
-- iscrivere due volte la stessa tabella e' un errore, non un no-op.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime non esiste qui: niente da iscrivere';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'movimenti'
  ) then
    alter publication supabase_realtime add table public.movimenti;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessioni'
  ) then
    alter publication supabase_realtime add table public.sessioni;
  end if;
end;
$$;
