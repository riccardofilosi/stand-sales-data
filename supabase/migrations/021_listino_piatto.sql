-- 021_listino_piatto.sql
--
-- La cartella «categoria» se ne va. In cassa non e' mai esistita (la griglia
-- disegna famiglie), il committente chiede solo l'aggregato cibo-bevande nei
-- report, e per il capo era un livello da creare e riordinare senza guadagno.
-- La famiglia (sottocategoria) diventa il livello massimo del catalogo: si
-- aggancia alla sessione e porta un tipo — 'cibo' o 'bevanda' — che e' una
-- parola da scegliere, non una cartella da gestire.

-- 1) Le colonne nuove, prima nullabili per poter riempire dallo storico.
alter table public.sottocategorie
  add column sessione_id uuid references public.sessioni(id) on delete cascade,
  add column tipo text check (tipo in ('cibo', 'bevanda'));

update public.sottocategorie s
   set sessione_id = c.sessione_id,
       -- L'euristica serve solo per il travaso: da qui in poi il tipo lo
       -- sceglie una persona con un interruttore, non un nome di cartella.
       tipo = case when c.nome ilike '%bev%' or c.nome ilike '%drink%'
                   then 'bevanda' else 'cibo' end
  from public.categorie c
 where c.id = s.categoria_id;

alter table public.sottocategorie
  alter column sessione_id set not null,
  alter column tipo        set not null;

-- Il nome era unico dentro la categoria; ora e' unico dentro l'edizione.
-- Due «Spritz» sotto cartelle diverse della stessa edizione sarebbero stati
-- comunque indistinguibili in cassa, dove la cartella non si e' mai vista.
alter table public.sottocategorie
  add constraint sottocategorie_sessione_id_nome_key unique (sessione_id, nome);

-- 2) Il ramo non si trapianta: la regola passa dalla categoria alla sessione.
drop trigger if exists sottocategorie_categoria_immutabile on public.sottocategorie;
create trigger sottocategorie_sessione_immutabile
  before update on public.sottocategorie
  for each row execute function public.colonna_immutabile('sessione_id', 'la sessione');

drop index if exists sottocategorie_per_categoria;
create index sottocategorie_per_sessione on public.sottocategorie (sessione_id, ordine);

-- 3) Le funzioni che passavano dalla cartella ora vanno dritte.

create or replace function public.offerte_componenti_stessa_sessione()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione_offerta uuid;
  v_sessione_sotto   uuid;
begin
  select sessione_id into v_sessione_offerta
  from public.offerte where id = new.offerta_id;

  select sessione_id into v_sessione_sotto
  from public.sottocategorie where id = new.sottocategoria_id;

  if v_sessione_offerta is distinct from v_sessione_sotto then
    raise exception 'la sottocategoria appartiene a una sessione diversa dall''offerta';
  end if;

  return new;
end;
$$;

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

  if not exists (
    select 1
    from public.prodotti p
    join public.sottocategorie s on s.id = p.sottocategoria_id
    where s.sessione_id = p_sessione and not p.nascosto
  ) then
    raise exception 'il listino e vuoto: la sessione non si apre';
  end if;

  if exists (
    select 1
    from public.prodotti p
    join public.sottocategorie s on s.id = p.sottocategoria_id
    where s.sessione_id = p_sessione and not p.nascosto and p.prezzo_cent is null
  ) then
    raise exception 'ci sono prodotti senza prezzo: la sessione non si apre';
  end if;

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

-- La copia perde un piano e il legame per nome resta: i nomi delle famiglie
-- sono unici dentro l'edizione.
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

  if exists (select 1 from public.sottocategorie  where sessione_id = p_a)
     or exists (select 1 from public.offerte         where sessione_id = p_a)
     or exists (select 1 from public.categorie_costo where sessione_id = p_a)
  then
    raise exception 'la sessione di destinazione ha gia un catalogo';
  end if;

  insert into public.sottocategorie (sessione_id, nome, tipo, colore, ordine)
  select p_a, nome, tipo, colore, ordine
  from public.sottocategorie where sessione_id = p_da;

  insert into public.prodotti (sottocategoria_id, nome, prezzo_cent, ordine)
  select sn.id, p.nome, p.prezzo_cent, p.ordine
  from public.prodotti p
  join public.sottocategorie sv on sv.id = p.sottocategoria_id and sv.sessione_id = p_da
  join public.sottocategorie sn on sn.sessione_id = p_a and sn.nome = sv.nome
  where not p.nascosto;

  insert into public.offerte (sessione_id, nome, prezzo_cent, ordine)
  select p_a, nome, prezzo_cent, ordine
  from public.offerte where sessione_id = p_da and not nascosta;

  insert into public.offerte_componenti (offerta_id, sottocategoria_id, quantita)
  select ovn.id, sn.id, k.quantita
  from public.offerte_componenti k
  join public.offerte ov on ov.id = k.offerta_id and ov.sessione_id = p_da
  join public.offerte ovn on ovn.sessione_id = p_a and ovn.nome = ov.nome
  join public.sottocategorie sv on sv.id = k.sottocategoria_id and sv.sessione_id = p_da
  join public.sottocategorie sn on sn.sessione_id = p_a and sn.nome = sv.nome;

  insert into public.categorie_costo (sessione_id, nome, ordine)
  select p_a, nome, ordine
  from public.categorie_costo where sessione_id = p_da;
end;
$$;

-- registra_movimenti() cambia in un punto solo — il controllo che il prodotto
-- appartenga alla sessione aperta non passa piu' per la cartella — ma una
-- funzione si ridefinisce intera.
create or replace function public.registra_movimenti(p_righe jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione   uuid;
  v_aperta_il  timestamptz;
  v_gruppo     uuid;
  v_offerta_id uuid;
  v_offerta    public.offerte%rowtype;
  v_atteso     jsonb;
  v_presente   jsonb;
  v_inserite   int;
begin
  if auth.uid() is null then
    raise exception 'non autenticato';
  end if;

  if p_righe is null
     or jsonb_typeof(p_righe) <> 'array'
     or jsonb_array_length(p_righe) = 0 then
    raise exception 'nessuna riga da registrare';
  end if;

  select id, aperta_il into v_sessione, v_aperta_il
  from public.sessioni where stato = 'aperta';
  if v_sessione is null then
    raise exception 'nessuna sessione aperta';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where coalesce((r->>'quantita')::numeric, 0) not between 1 and 99
  ) then
    raise exception
      'quantita fuori intervallo: da 1 a 99. Per numeri piu grandi, dividila in piu righe';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'registrato_il', '') is null
  ) then
    raise exception 'una riga non porta l ora del tocco';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'ordine_id', '') is null
  ) then
    raise exception 'una riga non porta l ordine';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    group by (r->>'id')::uuid
    having count(*) > 1
  ) then
    raise exception 'lo stesso movimento compare due volte nel lotto';
  end if;

  if exists (
    select 1
    from public.movimenti m
    where m.gruppo in (
            select (r->>'gruppo')::uuid from jsonb_array_elements(p_righe) r)
      and not exists (
            select 1 from jsonb_array_elements(p_righe) r
            where (r->>'id')::uuid = m.id)
  ) then
    raise exception 'il gruppo di una riga e gia stato usato';
  end if;

  if exists (
    select 1
    from public.movimenti m
    where m.storna_id is null
      and m.ordine_id in (
            select (r->>'ordine_id')::uuid from jsonb_array_elements(p_righe) r)
      and not exists (
            select 1 from jsonb_array_elements(p_righe) r
            where (r->>'id')::uuid = m.id)
  ) then
    raise exception 'l ordine di una riga e gia stato usato';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    group by (r->>'gruppo')::uuid
    having count(distinct r->>'ordine_id') > 1
  ) then
    raise exception 'un gruppo non puo stare in due ordini';
  end if;

  if exists (
    select 1
    from (
      select count(m.id) as gia, count(*) as totale
      from jsonb_array_elements(p_righe) r
      left join public.movimenti m on m.id = (r->>'id')::uuid
      where nullif(r->>'offerta_id', '') is not null
      group by (r->>'gruppo')::uuid
    ) g
    where g.gia <> 0 and g.gia <> g.totale
  ) then
    raise exception 'un offerta si registra tutta insieme o per niente';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    left join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    where p.id is null
  ) then
    raise exception 'una riga cita un prodotto inesistente';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    where p.prezzo_cent is null
  ) then
    raise exception 'una riga cita un prodotto senza prezzo';
  end if;

  -- Il controllo di appartenenza ora e' a un passo solo dal prodotto.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    join public.sottocategorie s on s.id = p.sottocategoria_id
    where s.sessione_id <> v_sessione
  ) then
    raise exception 'una riga cita un prodotto di un altra edizione';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.offerte o on o.id = nullif(r->>'offerta_id', '')::uuid
    where o.sessione_id <> v_sessione
  ) then
    raise exception 'una riga cita un offerta di un altra edizione';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    group by (r->>'gruppo')::uuid
    having count(distinct coalesce(nullif(r->>'offerta_id', ''), '-')) > 1
  ) then
    raise exception 'un gruppo non puo mescolare righe con e senza offerta';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'offerta_id', '') is not null
      and coalesce((r->>'quantita')::int, 1) <> 1
  ) then
    raise exception 'dentro un offerta ogni riga vale un pezzo';
  end if;

  for v_gruppo, v_offerta_id in
    select distinct (r->>'gruppo')::uuid, (r->>'offerta_id')::uuid
    from jsonb_array_elements(p_righe) r
    where nullif(r->>'offerta_id', '') is not null
  loop
    select * into v_offerta from public.offerte where id = v_offerta_id;
    if not found then
      raise exception 'offerta inesistente: %', v_offerta_id;
    end if;

    select jsonb_object_agg(sottocategoria_id::text, quantita)
      into v_atteso
      from public.offerte_componenti where offerta_id = v_offerta_id;

    select jsonb_object_agg(sc, n) into v_presente
      from (
        select pr.sottocategoria_id::text as sc, count(*)::int as n
        from jsonb_array_elements(p_righe) r
        join public.prodotti pr on pr.id = (r->>'prodotto_id')::uuid
        where (r->>'gruppo')::uuid = v_gruppo
        group by pr.sottocategoria_id
      ) t;

    if v_atteso is distinct from v_presente then
      raise exception 'l''offerta % non corrisponde alle righe del gruppo',
        v_offerta.nome;
    end if;
  end loop;

  insert into public.movimenti (
    id, sessione_id, prodotto_id, quantita, prezzo_cent,
    gruppo, ordine_id, offerta_id, operatore_id, registrato_il
  )
  select
    s.id,
    v_sessione,
    s.prodotto_id,
    s.quantita,
    case
      when s.offerta_id is null then s.listino
      else s.quota + case when s.rango <= s.resto then 1 else 0 end
    end,
    s.gruppo,
    s.ordine_id,
    s.offerta_id,
    auth.uid(),
    s.registrato_il
  from (
    select
      v.*,
      (v.offerta_prezzo * v.listino) / nullif(v.listino_gruppo, 0) as quota,
      v.offerta_prezzo
        - sum((v.offerta_prezzo * v.listino) / nullif(v.listino_gruppo, 0))
            over (partition by v.gruppo) as resto,
      row_number() over (partition by v.gruppo order by v.listino desc, v.id) as rango
    from (
      select
        (r->>'id')::uuid                      as id,
        (r->>'prodotto_id')::uuid             as prodotto_id,
        coalesce((r->>'quantita')::int, 1)    as quantita,
        (r->>'gruppo')::uuid                  as gruppo,
        (r->>'ordine_id')::uuid               as ordine_id,
        nullif(r->>'offerta_id', '')::uuid    as offerta_id,
        greatest(
          least((r->>'registrato_il')::timestamptz, now()),
          coalesce(v_aperta_il, '-infinity'::timestamptz)
        ) as registrato_il,
        p.prezzo_cent                         as listino,
        sum(p.prezzo_cent) over (partition by (r->>'gruppo')::uuid) as listino_gruppo,
        o.prezzo_cent                         as offerta_prezzo
      from jsonb_array_elements(p_righe) r
      join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
      left join public.offerte o on o.id = nullif(r->>'offerta_id', '')::uuid
    ) v
  ) s
  on conflict (id) do nothing;

  get diagnostics v_inserite = row_count;
  return v_inserite;
end;
$$;

-- 4) La cartella cade per ultima, quando piu' niente la cita.
--    `cascade` porta via la chiave esterna, le policy e l'indice suoi.
alter table public.sottocategorie drop column categoria_id cascade;
drop table public.categorie cascade;
