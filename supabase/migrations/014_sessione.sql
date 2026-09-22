-- 014_sessione.sql
-- Apertura, chiusura e copia del catalogo dall'edizione precedente.

create or replace function public.apri_sessione(p_sessione uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_gestore() then
    raise exception 'solo il gestore apre una sessione';
  end if;

  if not exists (select 1 from public.sessioni where id = p_sessione) then
    raise exception 'sessione inesistente';
  end if;

  if exists (
    select 1 from public.sessioni where stato = 'aperta' and id <> p_sessione
  ) then
    raise exception 'un altra sessione e gia aperta: chiuderla prima';
  end if;

  -- Una sessione senza prodotti apre una cassa vuota: l'operatore si trova una
  -- griglia bianca e nessun modo di capire se e' un guasto o una dimenticanza
  -- del gestore. Meglio che il no arrivi a chi puo' rimediare.
  if not exists (
    select 1
    from public.prodotti p
    join public.sottocategorie s on s.id = p.sottocategoria_id
    join public.categorie c on c.id = s.categoria_id
    where c.sessione_id = p_sessione and not p.nascosto
  ) then
    raise exception 'il listino e vuoto: la sessione non si apre';
  end if;

  -- Un prodotto senza prezzo diventerebbe una riga di vendita senza prezzo:
  -- meglio non aprire che raccogliere un dato monco.
  if exists (
    select 1
    from public.prodotti p
    join public.sottocategorie s on s.id = p.sottocategoria_id
    join public.categorie c on c.id = s.categoria_id
    where c.sessione_id = p_sessione and not p.nascosto and p.prezzo_cent is null
  ) then
    raise exception 'ci sono prodotti senza prezzo: la sessione non si apre';
  end if;

  -- Un'offerta senza componenti non e' registrabile: il bottone ci sarebbe e
  -- non farebbe nulla, il che e' peggio che non averlo.
  if exists (
    select 1 from public.offerte o
    where o.sessione_id = p_sessione and not o.nascosta
      and not exists (
        select 1 from public.offerte_componenti k where k.offerta_id = o.id
      )
  ) then
    raise exception 'ci sono offerte senza componenti: la sessione non si apre';
  end if;

  update public.sessioni
     set stato     = 'aperta',
         aperta_il = coalesce(aperta_il, now()),
         chiusa_il = null
   where id = p_sessione;
end;
$$;

create or replace function public.chiudi_sessione()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_gestore() then
    raise exception 'solo il gestore chiude una sessione';
  end if;

  update public.sessioni
     set stato = 'chiusa', chiusa_il = now()
   where stato = 'aperta';

  if not found then
    raise exception 'nessuna sessione aperta';
  end if;
end;
$$;

-- Copia il catalogo da un'edizione all'altra. Il legame fra vecchio e nuovo
-- passa dai nomi, che sono unici dentro la sessione: non serve una tabella di
-- corrispondenza e non restano identificativi in giro.
-- I prodotti nascosti non si copiano: erano finiti o ritirati, ripresentarli
-- l'anno dopo obbligherebbe a nasconderli di nuovo.
create or replace function public.copia_catalogo(p_da uuid, p_a uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_gestore() then
    raise exception 'solo il gestore copia un catalogo';
  end if;

  if (select stato from public.sessioni where id = p_a) <> 'bozza' then
    raise exception 'si copia solo dentro una sessione in bozza';
  end if;

  -- Guardare le sole categorie non basta: offerte e categorie di costo pendono
  -- direttamente dalla sessione, senza passare per un albero, quindi possono
  -- esistere da sole. Una destinazione con due offerte orfane si ritroverebbe
  -- il catalogo fuso al vecchio, in silenzio e senza traccia.
  -- Sottocategorie, prodotti e componenti non si controllano perche' non
  -- possono esistere senza un genitore fra questi tre.
  if exists (select 1 from public.categorie       where sessione_id = p_a)
     or exists (select 1 from public.offerte         where sessione_id = p_a)
     or exists (select 1 from public.categorie_costo where sessione_id = p_a)
  then
    raise exception 'la sessione di destinazione ha gia un catalogo';
  end if;

  insert into public.categorie (sessione_id, nome, ordine)
  select p_a, nome, ordine
  from public.categorie where sessione_id = p_da;

  insert into public.sottocategorie (categoria_id, nome, colore, ordine)
  select cn.id, s.nome, s.colore, s.ordine
  from public.sottocategorie s
  join public.categorie cv on cv.id = s.categoria_id and cv.sessione_id = p_da
  join public.categorie cn on cn.sessione_id = p_a and cn.nome = cv.nome;

  insert into public.prodotti (sottocategoria_id, nome, prezzo_cent, ordine)
  select sn.id, p.nome, p.prezzo_cent, p.ordine
  from public.prodotti p
  join public.sottocategorie sv on sv.id = p.sottocategoria_id
  join public.categorie cv on cv.id = sv.categoria_id and cv.sessione_id = p_da
  join public.categorie cn on cn.sessione_id = p_a and cn.nome = cv.nome
  join public.sottocategorie sn on sn.categoria_id = cn.id and sn.nome = sv.nome
  where not p.nascosto;

  insert into public.offerte (sessione_id, nome, prezzo_cent, ordine)
  select p_a, nome, prezzo_cent, ordine
  from public.offerte where sessione_id = p_da and not nascosta;

  insert into public.offerte_componenti (offerta_id, sottocategoria_id, quantita)
  select ovn.id, sn.id, k.quantita
  from public.offerte_componenti k
  join public.offerte ov on ov.id = k.offerta_id and ov.sessione_id = p_da
  join public.offerte ovn on ovn.sessione_id = p_a and ovn.nome = ov.nome
  join public.sottocategorie sv on sv.id = k.sottocategoria_id
  join public.categorie cv on cv.id = sv.categoria_id and cv.sessione_id = p_da
  join public.categorie cn on cn.sessione_id = p_a and cn.nome = cv.nome
  join public.sottocategorie sn on sn.categoria_id = cn.id and sn.nome = sv.nome;

  insert into public.categorie_costo (sessione_id, nome, ordine)
  select p_a, nome, ordine
  from public.categorie_costo where sessione_id = p_da;
end;
$$;

revoke execute on function public.apri_sessione(uuid)        from public, anon;
revoke execute on function public.chiudi_sessione()          from public, anon;
revoke execute on function public.copia_catalogo(uuid, uuid) from public, anon;
grant  execute on function public.apri_sessione(uuid)        to authenticated;
grant  execute on function public.chiudi_sessione()          to authenticated;
grant  execute on function public.copia_catalogo(uuid, uuid) to authenticated;
