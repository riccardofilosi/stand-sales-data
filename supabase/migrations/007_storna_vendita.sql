-- 007_storna_vendita.sql
--
-- Annullare una vendita non significa cancellarla: si aggiunge una riga
-- speculare di segno opposto. L'incasso si ottiene sommando totale_cent,
-- e la vendita sbagliata resta visibile insieme alla sua correzione.

create or replace function public.storna_vendita(p_sale uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.sales%rowtype;
  v_new  uuid;
begin
  if not public.is_gestore() then
    raise exception 'solo il gestore puo stornare una vendita';
  end if;

  select * into v_orig from public.sales where id = p_sale for update;
  if not found then
    raise exception 'vendita inesistente';
  end if;
  if v_orig.storno_di is not null then
    raise exception 'uno storno non si storna';
  end if;
  if exists (select 1 from public.sales where storno_di = p_sale) then
    raise exception 'vendita gia stornata';
  end if;

  insert into public.sales (event_id, operator_id, totale_cent, storno_di)
  values (v_orig.event_id, auth.uid(), -v_orig.totale_cent, p_sale)
  returning id into v_new;

  insert into public.sale_items (sale_id, product_id, offer_id, quantita, prezzo_unitario_cent)
  select v_new, product_id, offer_id, quantita, -prezzo_unitario_cent
  from public.sale_items
  where sale_id = p_sale;

  return v_new;
end;
$$;

revoke execute on function public.storna_vendita(uuid) from public, anon;
grant   execute on function public.storna_vendita(uuid) to authenticated;
