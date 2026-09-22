-- 020_ordini_senza_fuori_cassa.sql
--
-- Due cambi allo stesso oggetto, quindi una migrazione sola: riscrivere due
-- volte registra_movimenti() e storna_movimenti() nello stesso pacchetto
-- sarebbe solo un modo in piu' di sbagliare.
--
-- 1. VIA IL FUORI CASSA. Le specifiche nuove lo danno «ancora in dubbio» e la
--    decisione presa e' di lasciarlo fuori per ora. Con lui se ne vanno
--    `canale` e `causale`: restava una sola colonna a due valori di cui uno
--    non si sarebbe piu' scritto, e un vincolo che raccontava una storia che
--    non c'e' piu'.
--
-- 2. ARRIVA L'ORDINE. `gruppo` lega le righe nate da UN GESTO — le tre di
--    un'offerta. Non lega le righe nate da UN CLIENTE, che e' cosa diversa e
--    piu' grande: tre spritz, due cicchetti e un'offerta sono un ordine solo e
--    quattro gruppi. Senza questa colonna non si puo' contare quanti ordini ha
--    fatto la serata, ne' stornarne uno intero con un tocco — che e' la
--    correzione vera, perche' l'errore che si scopre dopo e' quasi sempre
--    «questo non ha pagato» o «l ho battuto due volte».

-- ---------------------------------------------------------------------------
-- Guardia. Se in archivio ci sono righe di fuori cassa sono dato vero, non
-- impalcatura: buttarle in silenzio dentro una migrazione sarebbe il modo
-- peggiore di scoprirlo. Meglio fermarsi e farle archiviare a mano.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.movimenti where canale = 'fuori_cassa') then
    raise exception
      'ci sono % righe di fuori cassa in archivio: esportale prima, questa migrazione le cancellerebbe',
      (select count(*) from public.movimenti where canale = 'fuori_cassa');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.movimenti drop constraint if exists canale_coerente;
alter table public.movimenti drop constraint if exists offerta_solo_in_vendita;
alter table public.movimenti drop column if exists canale;
alter table public.movimenti drop column if exists causale;

-- Ogni riga e' una vendita, quindi il prezzo c'e' sempre. Era nullabile solo
-- per il fuori cassa, che non ne aveva uno.
alter table public.movimenti alter column prezzo_cent set not null;

alter table public.movimenti add column if not exists ordine_id uuid;

-- Storico: uno storno eredita l'ordine della riga che corregge, cosi' il
-- totale netto di quell'ordine torna anche all'indietro. Tutto il resto
-- diventa un ordine per gesto — e' il meglio ricavabile da righe scritte
-- quando l'ordine non esisteva, e non inventa raggruppamenti mai avvenuti.
update public.movimenti s
   set ordine_id = o.gruppo
  from public.movimenti o
 where s.storna_id = o.id and s.ordine_id is null;

update public.movimenti set ordine_id = gruppo where ordine_id is null;

alter table public.movimenti alter column ordine_id set not null;

create index if not exists movimenti_per_ordine
  on public.movimenti (sessione_id, ordine_id);

-- ---------------------------------------------------------------------------
-- registra_movimenti()
--
-- Formato dell'argomento — un lotto di righe gia' pronte sul dispositivo:
-- [
--   {"id":"uuid","prodotto_id":"uuid","quantita":1,"gruppo":"uuid",
--    "ordine_id":"uuid","offerta_id":null,
--    "registrato_il":"2026-08-08T21:04:12.345Z"}
-- ]
--
-- Il client NON manda prezzi. Se ne mandasse, verrebbero ignorati: il prezzo
-- si legge dal listino qui dentro.
-- ---------------------------------------------------------------------------
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

  -- `p_righe is null` va per primo: senza, jsonb_typeof(null) e' null, il
  -- confronto e' null, l'if non scatta e la funzione tornerebbe 0 come se il
  -- lotto fosse gia' arrivato. La coda leggerebbe quello 0 come "consegnata"
  -- e butterebbe via una busta serializzata male.
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

  -- La quantita' e' l'unica leva rimasta al client dopo che il prezzo gli e'
  -- stato tolto, ed e' altrettanto pericolosa. Una riga con quantita' negativa
  -- e nessuno storna_id e' un annullo invisibile: nessuna traccia, e nessuno
  -- dei controlli di storna_movimenti(). Chi incassa potrebbe intascare e poi
  -- appiattire il proprio totale perche' la cassa della sera torni.
  -- Il tetto non e' burocrazia: e' quanti pezzi una persona passa sopra il
  -- banco in un gesto solo, e ferma anche uno zero mancante. Una riga senza
  -- quantita' cade qui, invece di diventare un pezzo solo perche' il campo e'
  -- stato rinominato. Il confronto passa da numeric perche' un valore oltre
  -- l'intero darebbe errore di conversione prima di arrivare qui, con un
  -- messaggio illeggibile.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where coalesce((r->>'quantita')::numeric, 0) not between 1 and 99
  ) then
    raise exception
      'quantita fuori intervallo: da 1 a 99. Per numeri piu grandi, dividila in piu righe';
  end if;

  -- L'ora del tocco non e' facoltativa: senza, la riga finirebbe nella fascia
  -- oraria in cui e' arrivata, che e' esattamente cio' che la coda offline
  -- esiste per evitare.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'registrato_il', '') is null
  ) then
    raise exception 'una riga non porta l ora del tocco';
  end if;

  -- Senza ordine la riga non si sa a chi appartiene, e non e' recuperabile
  -- dopo: meglio rifiutarla adesso che contarla male per sempre.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'ordine_id', '') is null
  ) then
    raise exception 'una riga non porta l ordine';
  end if;

  -- Il controllo di composizione piu' avanti conta gli ELEMENTI dell'array;
  -- l'insert finale scrive CHIAVI PRIMARIE distinte. Ripetendo lo stesso id i
  -- due numeri smettono di combaciare: un'offerta da tre pezzi supera il
  -- controllo e ne scrive una riga sola, che si prende la quota intera.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    group by (r->>'id')::uuid
    having count(*) > 1
  ) then
    raise exception 'lo stesso movimento compare due volte nel lotto';
  end if;

  -- Il gruppo lega le righe nate da un gesto solo. Riusare un gruppo che sta
  -- gia' in archivio comporrebbe un insieme che nessun gesto ha prodotto: due
  -- offerte diverse sotto la stessa chiave, e i conteggi per offerta
  -- smetterebbero di tornare. Il reinvio della stessa busta non cade qui:
  -- porta gli stessi id, che sono tutti nel lotto, ed e' l'on conflict piu'
  -- avanti a scartarlo.
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

  -- Stessa regola un piano piu' su: un ordine e' un cliente, e un cliente non
  -- torna. Riusare un ordine gia' in archivio ne gonfierebbe il totale con
  -- righe di un'altra persona, e «storna tutto l ordine» ne porterebbe via
  -- anche quelle.
  -- Gli storni sono esclusi apposta: vivono dentro l'ordine che correggono, e
  -- senza questa esclusione un reinvio legittimo della busta originale
  -- verrebbe respinto perche' in archivio, sotto quell'ordine, c'e' ora anche
  -- una riga che nel lotto non c'era.
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

  -- Un gruppo e' un gesto dentro un ordine, quindi non puo' stare in due:
  -- se ci stesse, «storna tutto» ne lascerebbe indietro una parte.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    group by (r->>'gruppo')::uuid
    having count(distinct r->>'ordine_id') > 1
  ) then
    raise exception 'un gruppo non puo stare in due ordini';
  end if;

  -- Un'offerta si scrive tutta insieme o per niente. Se qualche riga del
  -- gruppo e' gia' in archivio e qualcun'altra no, l'on conflict scarta le
  -- prime in silenzio e la quota dell'offerta finisce tutta sulle poche
  -- rimaste: gli id gia' registrati sono leggibili da chiunque, quindi
  -- riattaccarli a un'offerta nuova sarebbe il modo piu' comodo per svuotarla.
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

  -- I prodotti nascosti si accettano di proposito: una riga messa in coda alle
  -- 21:28, mentre le sarde c'erano ancora, deve poter arrivare alle 21:35 dopo
  -- che sono state nascoste. Rifiutarla perderebbe una vendita vera.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    left join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    where p.id is null
  ) then
    raise exception 'una riga cita un prodotto inesistente';
  end if;

  -- apri_sessione() garantisce che il listino sia completo all'apertura, ma a
  -- sessione aperta si possono aggiungere prodotti (le sarde finiscono, arriva
  -- la sopressa) e per un attimo il prezzo puo' mancare. Il bottone intanto c'e'
  -- gia'. Meglio un rifiuto leggibile che una violazione di vincolo a meta'
  -- serata: la coda mette la busta fra le respinte e le altre passano.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    where p.prezzo_cent is null
  ) then
    raise exception 'una riga cita un prodotto senza prezzo';
  end if;

  -- Prodotti e offerte devono appartenere al catalogo della sessione aperta.
  -- Il client manda identificativi presi dalla sua copia del listino: se un
  -- telefono restasse indietro di un'edizione, le sue righe finirebbero nello
  -- storico di quest'anno sotto nomi che quest'anno nessuno ha venduto.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.prodotti p on p.id = (r->>'prodotto_id')::uuid
    join public.sottocategorie s on s.id = p.sottocategoria_id
    join public.categorie c on c.id = s.categoria_id
    where c.sessione_id <> v_sessione
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

  -- Un gruppo e' un gesto solo: o e' tutto dentro un'offerta o e' tutto fuori.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    group by (r->>'gruppo')::uuid
    having count(distinct coalesce(nullif(r->>'offerta_id', ''), '-')) > 1
  ) then
    raise exception 'un gruppo non puo mescolare righe con e senza offerta';
  end if;

  -- Dentro un'offerta ogni riga vale un pezzo: e' cio' che rende la
  -- spalmatura una divisione fra righe e non fra quantita'.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'offerta_id', '') is not null
      and coalesce((r->>'quantita')::int, 1) <> 1
  ) then
    raise exception 'dentro un offerta ogni riga vale un pezzo';
  end if;

  -- L'offerta si registra intera o non si registra: mezza offerta falserebbe
  -- sia l'incasso sia il conteggio per prodotto.
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

  -- Una sola scrittura. `on conflict do nothing` sulla chiave primaria e' cio'
  -- che rende innocuo il reinvio della stessa busta: la seconda volta non
  -- entra nulla e nessuno se ne accorge.
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
      -- La quota base piu' un centesimo alle prime righe in ordine di listino:
      -- cosi' la somma delle righe fa esattamente il prezzo dell'offerta.
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
      -- L'ordine deve essere deterministico, altrimenti due invii della stessa
      -- coda darebbero ripartizioni diverse. Listino piu' alto per primo, e a
      -- parita' di listino decide l'identificativo di riga.
      row_number() over (partition by v.gruppo order by v.listino desc, v.id) as rango
    from (
      select
        (r->>'id')::uuid                      as id,
        (r->>'prodotto_id')::uuid             as prodotto_id,
        coalesce((r->>'quantita')::int, 1)    as quantita,
        (r->>'gruppo')::uuid                  as gruppo,
        (r->>'ordine_id')::uuid               as ordine_id,
        nullif(r->>'offerta_id', '')::uuid    as offerta_id,
        -- Si stringe fra l'apertura della sessione e adesso. Un orologio avanti
        -- spingerebbe le righe in una fascia futura e Andamento mostrerebbe un
        -- picco mai avvenuto; uno indietro di un anno — fuso sbagliato, data
        -- persa dopo un riavvio — le spargerebbe fuori dalla serata, dove
        -- nessun grafico le andrebbe piu' a cercare.
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

revoke execute on function public.registra_movimenti(jsonb) from public, anon;
grant  execute on function public.registra_movimenti(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- storna_movimenti()
--
-- Formato dell'argomento:
-- [{"id":"uuid nuovo","storna_id":"uuid della riga da annullare",
--   "registrato_il":"2026-08-08T22:41:00.000Z"}]
--
-- Annullare non e' cancellare: si aggiunge una riga speculare con la quantita'
-- di segno opposto e lo stesso prezzo. La riga sbagliata resta accanto alla
-- sua correzione, e chi ha annullato cosa resta scritto.
--
-- Correggere una quantita' e' lo stesso gesto ripetuto: quattro spritz battuti
-- e tre ordinati sono un solo storno; l'ordine intero sono tanti storni quante
-- le sue righe. Non serve un verbo nuovo.
-- ---------------------------------------------------------------------------
create or replace function public.storna_movimenti(p_righe jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione uuid;
  v_aperta_il timestamptz;
  v_inserite int;
begin
  if auth.uid() is null then
    raise exception 'non autenticato';
  end if;

  if p_righe is null
     or jsonb_typeof(p_righe) <> 'array'
     or jsonb_array_length(p_righe) = 0 then
    raise exception 'nessuna riga da stornare';
  end if;

  select id, aperta_il into v_sessione, v_aperta_il
  from public.sessioni where stato = 'aperta';
  if v_sessione is null then
    raise exception 'nessuna sessione aperta';
  end if;

  -- Una riga senza l'ora del tocco finirebbe stampata `now()` in silenzio:
  -- `least(null, now())` in Postgres ignora il null invece di propagarlo.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'registrato_il', '') is null
  ) then
    raise exception 'una riga non porta l ora del tocco';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    left join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.id is null
  ) then
    raise exception 'una riga da stornare non esiste';
  end if;

  -- Chiusa la sessione, i suoi totali non si toccano piu'. Senza questo
  -- controllo bastava indicare una riga dell'anno scorso: la sessione aperta
  -- faceva solo da lasciapassare e lo storno si scriveva dentro l'edizione
  -- vecchia, riaprendo un conto che era stato chiuso.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.sessione_id <> v_sessione
  ) then
    raise exception 'si annulla solo dentro la sessione aperta';
  end if;

  -- Uno storno non si storna: si tornerebbe al punto di partenza lasciando
  -- tre righe dove ne bastava una, e nessuno saprebbe piu' leggere la storia.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.storna_id is not null
  ) then
    raise exception 'uno storno non si storna';
  end if;

  -- Ognuno annulla le proprie righe. Il consiglio annulla quelle di chiunque:
  -- e' lui a rispondere della cassa a fine serata.
  if not public.is_gestore() and exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.operatore_id <> auth.uid()
  ) then
    raise exception 'si annullano solo le proprie righe';
  end if;

  -- Un secondo tocco sul bottone di annullo genera una busta nuova, con un id
  -- nuovo: `on conflict (id)` non la riconosce come ripetizione e l'indice
  -- unico la respingerebbe con un errore di chiave duplicata, che nessuno sa
  -- leggere. Meglio dirlo prima e con parole.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.storna_id = (r->>'storna_id')::uuid
  ) then
    raise exception 'una riga indicata e gia stata annullata';
  end if;

  -- Due annulli della stessa riga dentro lo stesso lotto: senza questo
  -- controllo l'indice unico farebbe abortire l'intero insert, portandosi via
  -- anche gli annulli buoni che viaggiavano insieme.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    group by (r->>'storna_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'lo stesso movimento compare due volte fra gli annulli';
  end if;

  insert into public.movimenti (
    id, sessione_id, prodotto_id, quantita, prezzo_cent,
    gruppo, ordine_id, offerta_id, operatore_id, registrato_il, storna_id
  )
  select
    (r->>'id')::uuid,
    m.sessione_id,
    m.prodotto_id,
    -- Cambia segno la quantita', NON il prezzo. Girare tutti e due farebbe
    -- tornare positivo il prodotto quantita * prezzo, e lo storno
    -- raddoppierebbe l'incasso invece di annullarlo.
    -m.quantita,
    m.prezzo_cent,
    -- Lo storno fa gruppo da solo, cosi' non si confonde con l'offerta di cui
    -- la riga originale faceva parte...
    (r->>'id')::uuid,
    -- ...ma resta dentro l'ORDINE che corregge: e' li' che deve farsi trovare
    -- perche' il totale netto di quel cliente torni.
    m.ordine_id,
    m.offerta_id,
    auth.uid(),
    -- Stesso morso a tenaglia di registra_movimenti: l'orologio del telefono
    -- non porta lo storno ne' nel futuro ne' prima dell'apertura.
    greatest(
      least((r->>'registrato_il')::timestamptz, now()),
      coalesce(v_aperta_il, '-infinity'::timestamptz)
    ),
    m.id
  from jsonb_array_elements(p_righe) r
  join public.movimenti m on m.id = (r->>'storna_id')::uuid
  -- Il reinvio della stessa busta di annullo non porta via il doppio.
  on conflict (id) do nothing;

  get diagnostics v_inserite = row_count;
  return v_inserite;
end;
$$;

revoke execute on function public.storna_movimenti(jsonb) from public, anon;
grant  execute on function public.storna_movimenti(jsonb) to authenticated;
