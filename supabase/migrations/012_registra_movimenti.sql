-- 012_registra_movimenti.sql
--
-- Formato dell'argomento — un lotto di righe gia' pronte sul dispositivo:
-- [
--   {"id":"uuid","prodotto_id":"uuid","quantita":1,"canale":"vendita",
--    "causale":null,"gruppo":"uuid","offerta_id":null,
--    "registrato_il":"2026-08-08T21:04:12.345Z"}
-- ]
--
-- Il client NON manda prezzi. Se ne mandasse, verrebbero ignorati: il prezzo
-- si legge dal listino qui dentro.

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
  -- dei controlli di storna_movimenti() — non "e' gia' stata annullata", non
  -- "si annullano solo le proprie righe". Chi incassa potrebbe intascare e poi
  -- appiattire il proprio totale perche' la cassa della sera torni.
  -- Il segno negativo esiste solo dentro storna_movimenti(), che lascia la
  -- riga originale accanto alla sua correzione.
  -- Il tetto non e' burocrazia: e' quanti pezzi una persona passa sopra il
  -- banco in un gesto solo. Serve anche a fermare uno zero mancante.
  -- Una riga senza quantita' cade qui: meglio che diventare un pezzo solo
  -- perche' il campo e' stato rinominato.
  -- Il tetto e' piu' alto fuori cassa: in cassa nessuno passa cento pezzi in
  -- un gesto, ma uno scarto di fine serata — le sarde rimaste, una cassa di
  -- bicchieri, la cena dei volontari — e' un gesto solo su numeri grossi.
  -- Il confronto passa da numeric perche' un valore oltre l'intero darebbe
  -- errore di conversione prima di arrivare qui, con un messaggio illeggibile.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where coalesce((r->>'quantita')::numeric, 0) not between 1 and
          case when r->>'canale' = 'fuori_cassa' then 999 else 99 end
  ) then
    raise exception
      'quantita fuori intervallo: fino a 99 in cassa, fino a 999 fuori cassa. Per numeri piu grandi, dividila in piu righe';
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

  -- Il controllo di composizione piu' avanti conta gli ELEMENTI dell'array;
  -- l'insert finale scrive CHIAVI PRIMARIE distinte. Ripetendo lo stesso id i
  -- due numeri smettono di combaciare: un'offerta da tre pezzi supera il
  -- controllo e ne scrive una riga sola, che si prende la quota intera.
  -- Un prodotto da 4,00 registrato a 2,67, con un uuid ripetuto e nient'altro.
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
  -- smetterebbero di tornare.
  -- Il reinvio della stessa busta non cade qui: porta gli stessi id, che sono
  -- tutti nel lotto, ed e' l'on conflict piu' avanti a scartarlo.
  -- Ne segue un requisito sul client: un gruppo non attraversa mai due buste.
  -- La coda in src/lib/coda.ts lo rispetta, perche' non spezza mai una busta.
  -- `not exists` e non `not in`: con un id nullo nella lista, `not in` non e'
  -- mai vero e il controllo si spegnerebbe in silenzio.
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

  -- Un'offerta si scrive tutta insieme o per niente. Se qualche riga del
  -- gruppo e' gia' in archivio e qualcun'altra no, l'on conflict scarta le
  -- prime in silenzio e la quota dell'offerta finisce tutta sulle poche
  -- rimaste: gli id gia' registrati sono leggibili da chiunque, quindi
  -- riattaccarli a un'offerta nuova sarebbe il modo piu' comodo per svuotarla.
  -- Il reinvio della busta intera continua a passare: le sue righe sono TUTTE
  -- gia' in archivio, e l'on conflict le scarta tutte.
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
    where r->>'canale' = 'vendita' and p.prezzo_cent is null
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

  -- Stessa regola sull'altro asse: una vendita e un omaggio sono due gesti, e
  -- un gruppo che li contiene entrambi renderebbe indecidibile a quale dei due
  -- appartiene lo storno che lo annulla.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    group by (r->>'gruppo')::uuid
    having count(distinct r->>'canale') > 1
  ) then
    raise exception 'un gruppo non puo mescolare cassa e fuori cassa';
  end if;

  -- Dentro un'offerta ogni riga vale un pezzo: e' cio' che rende la
  -- spalmagione una divisione fra righe e non fra quantita'.
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
    canale, causale, gruppo, offerta_id, operatore_id, registrato_il
  )
  select
    s.id,
    v_sessione,
    s.prodotto_id,
    s.quantita,
    case
      when s.canale = 'fuori_cassa' then null
      when s.offerta_id is null     then s.listino
      -- La quota base piu' un centesimo alle prime righe in ordine di listino:
      -- cosi' la somma delle righe fa esattamente il prezzo dell'offerta.
      else s.quota + case when s.rango <= s.resto then 1 else 0 end
    end,
    s.canale,
    s.causale,
    s.gruppo,
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
        r->>'canale'                          as canale,
        nullif(r->>'causale', '')             as causale,
        (r->>'gruppo')::uuid                  as gruppo,
        nullif(r->>'offerta_id', '')::uuid    as offerta_id,
        -- Si stringe fra l'apertura della sessione e adesso. Un orologio avanti
        -- spingerebbe le righe in una fascia futura e Adesso mostrerebbe un
        -- picco mai avvenuto; uno indietro di un anno — fuso sbagliato, data
        -- persa dopo un riavvio — le spargerebbe fuori dalla serata, dove
        -- nessun grafico le andrebbe piu' a cercare.
        -- `-infinity` e non `now()` se l'apertura manca: senza pavimento si
        -- torna al morsetto da una parte sola, che e' poco; con now() si
        -- riscriverebbero all'ora di arrivo anche i tocchi veri di mezz'ora
        -- prima, che e' molto peggio. aperta_il e' nullabile e il gestore
        -- scrive su sessioni: una riga messa a mano puo' lasciarlo vuoto.
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
