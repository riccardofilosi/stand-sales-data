-- 004_registra_vendita.sql
--
-- Formato dell'argomento:
-- [
--   {"tipo": "singolo",  "product_id": "uuid", "quantita": 2},
--   {"tipo": "offerta",  "offer_id": "uuid",   "product_ids": ["uuid","uuid","uuid"]}
-- ]

-- Riga di vendita gia' valutata, accumulata in memoria prima di toccare
-- le tabelle: cosi' `sales` nasce con il totale definitivo e non serve
-- alcun valore provvisorio da correggere subito dopo.
create type public.riga_valutata as (
  product_id           uuid,
  offer_id             uuid,
  quantita             int,
  prezzo_unitario_cent int
);

create or replace function public.registra_vendita(p_righe jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event    uuid;
  v_sale     uuid;
  v_riga     jsonb;
  v_prezzo   int;
  v_qta      int;
  v_totale   int := 0;
  v_offer    public.offers%rowtype;
  v_prod_ids uuid[];
  v_n        int;
  v_base     int;
  v_resto    int;
  v_i        int;
  v_items    public.riga_valutata[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'non autenticato';
  end if;

  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'nessuna riga da registrare';
  end if;

  select id into v_event from public.events where attivo limit 1;
  if v_event is null then
    raise exception 'nessun evento attivo: aprire l''edizione prima di vendere';
  end if;

  -- Prima passata: si valuta tutto senza scrivere nulla.
  for v_riga in select * from jsonb_array_elements(p_righe)
  loop
    if v_riga->>'tipo' = 'singolo' then

      select ph.prezzo_cent into v_prezzo
      from public.price_history ph
      join public.products p on p.id = ph.product_id
      where ph.product_id = (v_riga->>'product_id')::uuid
        and ph.valido_a is null
        and p.attivo;

      if v_prezzo is null then
        raise exception 'prodotto inesistente, disattivato o senza prezzo corrente: %',
          v_riga->>'product_id';
      end if;

      v_qta := coalesce((v_riga->>'quantita')::int, 0);
      if v_qta <= 0 then
        raise exception 'quantita non valida';
      end if;

      v_items := v_items || row(
        (v_riga->>'product_id')::uuid, null::uuid, v_qta, v_prezzo
      )::public.riga_valutata;

      v_totale := v_totale + v_prezzo * v_qta;

    elsif v_riga->>'tipo' = 'offerta' then

      select * into v_offer from public.offers
      where id = (v_riga->>'offer_id')::uuid and attiva;
      if not found then
        raise exception 'offerta inesistente o disattivata';
      end if;

      select array_agg(value::uuid) into v_prod_ids
      from jsonb_array_elements_text(v_riga->'product_ids');

      v_n := coalesce(array_length(v_prod_ids, 1), 0);
      if v_n <> v_offer.quantita then
        raise exception 'l''offerta % richiede % prodotti, ricevuti %',
          v_offer.nome, v_offer.quantita, v_n;
      end if;

      if exists (
        select 1
        from unnest(v_prod_ids) as pid
        left join public.products p on p.id = pid
        where p.id is null
           or not p.attivo
           or p.categoria <> v_offer.categoria_ammessa
      ) then
        raise exception 'prodotti non ammessi per l''offerta %', v_offer.nome;
      end if;

      -- Il prezzo dell'offerta viene ripartito sui prodotti. Il resto della
      -- divisione va sui primi articoli, cosi' la somma delle righe e' esatta
      -- al centesimo: 3 cicchetti a 500 diventano 167 + 167 + 166.
      v_base  := v_offer.prezzo_cent / v_n;
      v_resto := v_offer.prezzo_cent % v_n;

      for v_i in 1..v_n loop
        v_items := v_items || row(
          v_prod_ids[v_i], v_offer.id, 1,
          v_base + case when v_i <= v_resto then 1 else 0 end
        )::public.riga_valutata;
      end loop;

      v_totale := v_totale + v_offer.prezzo_cent;

    else
      raise exception 'tipo di riga non valido: %', coalesce(v_riga->>'tipo', 'assente');
    end if;
  end loop;

  if v_totale <= 0 then
    raise exception 'totale non valido';
  end if;

  -- Seconda passata: si scrive, una volta sola, con il totale gia' esatto.
  insert into public.sales (event_id, operator_id, totale_cent)
  values (v_event, auth.uid(), v_totale)
  returning id into v_sale;

  insert into public.sale_items
    (sale_id, product_id, offer_id, quantita, prezzo_unitario_cent)
  select v_sale, r.product_id, r.offer_id, r.quantita, r.prezzo_unitario_cent
  from unnest(v_items) as r;

  return v_sale;
end;
$$;

revoke execute on function public.registra_vendita(jsonb) from public, anon;
grant   execute on function public.registra_vendita(jsonb) to authenticated;
