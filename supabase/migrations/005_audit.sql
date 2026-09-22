-- 005_audit.sql

create or replace function public.scrivi_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (tabella, record_id, azione, attore, prima, dopo)
  values (
    tg_table_name,
    coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_price_history
  after insert or update or delete on public.price_history
  for each row execute function public.scrivi_audit();

create trigger audit_profiles
  after update on public.profiles
  for each row execute function public.scrivi_audit();

create trigger audit_pending_changes
  after insert or update on public.pending_changes
  for each row execute function public.scrivi_audit();

create trigger audit_products
  after insert or update on public.products
  for each row execute function public.scrivi_audit();

create trigger audit_offers
  after insert or update on public.offers
  for each row execute function public.scrivi_audit();

create trigger audit_purchases
  after insert or update or delete on public.purchases
  for each row execute function public.scrivi_audit();

-- Nessun ruolo applicativo puo' scrivere qui: le uniche update e delete
-- possibili arrivano da fuori dall'applicazione, con privilegi di servizio,
-- ed e' esattamente il caso in cui si vuole saperlo. Le insert non si
-- registrano perche' la riga di vendita e' gia' il proprio documento.
create trigger audit_sales
  after update or delete on public.sales
  for each row execute function public.scrivi_audit();

-- Senza questo, una cancellazione a cascata porterebbe via il dettaglio
-- della vendita lasciando a registro la sola testata.
create trigger audit_sale_items
  after update or delete on public.sale_items
  for each row execute function public.scrivi_audit();

-- L'edizione di un acquisto non e' un dato che il client possa scegliere.
create or replace function public.purchases_evento_corrente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- L'operatore non sceglie l'edizione: gli viene imposta quella aperta.
  -- Il gestore puo' indicarla, perche' una fattura in ritardo va imputata
  -- all'edizione a cui appartiene, non a quella in corso.
  if not public.is_gestore() or new.event_id is null then
    select id into new.event_id from public.events where attivo limit 1;
    if new.event_id is null then
      raise exception 'nessun evento attivo';
    end if;
  end if;
  return new;
end;
$$;

create trigger purchases_forza_evento
  before insert on public.purchases
  for each row execute function public.purchases_evento_corrente();
