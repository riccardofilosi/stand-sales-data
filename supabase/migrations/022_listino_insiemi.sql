-- 022_listino_insiemi.sql
--
-- Il listino diventa a «insiemi»: ogni edizione ha due insiemi fissi — Cibo e
-- Bevande — piu' eventuali insiemi liberi di tipo 'altro' col nome scelto dal
-- consiglio («Dolci», «Gadget»...). Le famiglie personalizzate spariscono: i
-- prodotti stanno dritti nell'insieme e il colore — finora della famiglia —
-- passa al prodotto, che in cassa e' il bottone che si cerca con gli occhi.
--
-- Nessun prodotto cambia id: i movimenti li citano e lo storico non si tocca.
-- Il remap e' fatto di soli UPDATE sui prodotti e si porta dietro l'ordine
-- di lettura del vecchio listino (famiglia per famiglia).

-- 1) Il tipo accoglie 'altro'.
alter table public.sottocategorie
  drop constraint sottocategorie_tipo_check;
alter table public.sottocategorie
  add constraint sottocategorie_tipo_check check (tipo in ('cibo', 'bevanda', 'altro'));

-- 2) Il colore passa al prodotto. Il vincolo e' di FORMATO, non un elenco:
--    la curatela della palette sta nel frontend (lib/colori.ts), e un elenco
--    qui costringerebbe a una migrazione per ogni ritocco senza garantire
--    comunque che due esadecimali "in lista" siano distinguibili a occhio.
alter table public.prodotti add column colore text;

update public.prodotti p
   set colore = s.colore
  from public.sottocategorie s
 where s.id = p.sottocategoria_id;

alter table public.prodotti
  alter column colore set not null,
  add constraint prodotti_colore_formato check (colore ~ '^#[0-9A-F]{6}$');

-- 3) Sulla famiglia il colore non serve piu': cade il vincolo a sette tinte e
--    la colonna diventa facoltativa. NON si elimina qui: tra l'applicazione di
--    questa migrazione e il deploy del frontend nuovo c'e' una finestra in cui
--    l'app vecchia la seleziona ancora. Sparira' con una migrazione futura.
alter table public.sottocategorie
  drop constraint sottocategorie_colore_check,
  alter column colore drop not null;

-- 4) Ogni sessione esistente riceve i due insiemi fissi. Se una famiglia si
--    chiama gia' «Cibo» o «Bevande» viene promossa a insieme canonico invece
--    di far inciampare l'unicita' del nome (il suo tipo viene allineato: e' il
--    nome, a quel punto, a dire la verita').
insert into public.sottocategorie (sessione_id, nome, tipo, colore, ordine)
select s.id, v.nome, v.tipo, v.colore, v.ordine
from public.sessioni s
cross join (values
  ('Cibo',    'cibo',    '#B84A10', 1),
  ('Bevande', 'bevanda', '#0B63A8', 2)
) as v(nome, tipo, colore, ordine)
on conflict (sessione_id, nome)
do update set tipo = excluded.tipo, ordine = excluded.ordine;

-- 5) Remap dei prodotti dentro gli insiemi canonici.
--    a. Due prodotti omonimi che confluirebbero nello stesso insieme si
--       disambiguano col nome della famiglia d'origine: l'unicita'
--       (sottocategoria_id, nome) altrimenti farebbe fallire tutto.
with posti as (
  select p.id,
         p.nome,
         s.nome as famiglia,
         row_number() over (
           partition by s.sessione_id, s.tipo, p.nome
           order by s.ordine, s.nome, p.ordine, p.id
         ) as posto
  from public.prodotti p
  join public.sottocategorie s on s.id = p.sottocategoria_id
  where s.tipo in ('cibo', 'bevanda')
)
update public.prodotti p
   set nome = posti.nome || ' (' || posti.famiglia || ')'
  from posti
 where p.id = posti.id and posti.posto > 1;

--    b. L'ordine nuovo si calcola PRIMA di muovere: famiglia per famiglia,
--       cosi' il menu' conserva la sequenza in cui e' sempre stato letto.
with sequenza as (
  select p.id,
         row_number() over (
           partition by s.sessione_id, s.tipo
           order by s.ordine, s.nome, p.ordine, p.nome, p.id
         ) as ordine_nuovo
  from public.prodotti p
  join public.sottocategorie s on s.id = p.sottocategoria_id
  where s.tipo in ('cibo', 'bevanda')
)
update public.prodotti p
   set ordine = sequenza.ordine_nuovo
  from sequenza
 where p.id = sequenza.id;

--    c. Lo spostamento vero. La guardia «il catalogo non si trapianta» (009)
--       esiste proprio per impedire questo gesto a runtime: qui e' il gesto
--       della migrazione stessa, e si sospende per il tempo necessario.
alter table public.prodotti disable trigger prodotti_sottocategoria_immutabile;

update public.prodotti p
   set sottocategoria_id = can.id
  from public.sottocategorie s
  join public.sottocategorie can
    on can.sessione_id = s.sessione_id
   and can.tipo = s.tipo
   and can.nome = case s.tipo when 'cibo' then 'Cibo' else 'Bevande' end
 where s.id = p.sottocategoria_id
   and s.tipo in ('cibo', 'bevanda')
   and s.id <> can.id;

alter table public.prodotti enable trigger prodotti_sottocategoria_immutabile;

-- 6) Remap dei componenti delle offerte. Due componenti della stessa offerta
--    che puntavano a due famiglie dello stesso tipo collassano sull'insieme:
--    il capofila si prende la quantita' totale, gli altri se ne vanno.
--    («3 Cicchetti» diventa «3 pezzi dall'insieme Cibo»: e' l'allargamento
--    intrinseco al ridisegno, registra_movimenti continua a verificare la
--    composizione per sottocategoria_id senza cambiare.)
--    L'ordine dei tre passi evita l'unicita' (offerta_id, sottocategoria_id):
--    prima la somma, poi via i doppioni, poi lo spostamento.
with mappa as (
  select k.id,
         -- min(uuid) non esiste: il capofila e' il primo id in ordine.
         first_value(k.id) over (partition by k.offerta_id, can.id order by k.id) as capofila,
         sum(k.quantita) over (partition by k.offerta_id, can.id) as totale
  from public.offerte_componenti k
  join public.sottocategorie s on s.id = k.sottocategoria_id
  join public.sottocategorie can
    on can.sessione_id = s.sessione_id
   and can.tipo = s.tipo
   and can.nome = case s.tipo when 'cibo' then 'Cibo' else 'Bevande' end
  where s.tipo in ('cibo', 'bevanda')
)
update public.offerte_componenti k
   set quantita = mappa.totale
  from mappa
 where k.id = mappa.id and mappa.id = mappa.capofila;

with mappa as (
  select k.id,
         first_value(k.id) over (partition by k.offerta_id, can.id order by k.id) as capofila
  from public.offerte_componenti k
  join public.sottocategorie s on s.id = k.sottocategoria_id
  join public.sottocategorie can
    on can.sessione_id = s.sessione_id
   and can.tipo = s.tipo
   and can.nome = case s.tipo when 'cibo' then 'Cibo' else 'Bevande' end
  where s.tipo in ('cibo', 'bevanda')
)
delete from public.offerte_componenti k
 using mappa
 where k.id = mappa.id and mappa.id <> mappa.capofila;

update public.offerte_componenti k
   set sottocategoria_id = can.id
  from public.sottocategorie s
  join public.sottocategorie can
    on can.sessione_id = s.sessione_id
   and can.tipo = s.tipo
   and can.nome = case s.tipo when 'cibo' then 'Cibo' else 'Bevande' end
 where s.id = k.sottocategoria_id
   and s.tipo in ('cibo', 'bevanda')
   and s.id <> can.id;

-- 7) Le famiglie svuotate se ne vanno. La guardia di esistenza e' la rete di
--    sicurezza: se un remap avesse lasciato qualcosa indietro, la riga resta
--    e la si vede — meglio una famiglia orfana visibile che una perdita muta.
delete from public.sottocategorie s
 where s.tipo in ('cibo', 'bevanda')
   and s.nome <> case s.tipo when 'cibo' then 'Cibo' else 'Bevande' end
   and not exists (select 1 from public.prodotti p where p.sottocategoria_id = s.id)
   and not exists (select 1 from public.offerte_componenti k where k.sottocategoria_id = s.id);

-- 8) Da qui in poi il database impone cio' che la migrazione ha appena
--    costruito: un solo insieme cibo e un solo insieme bevande per edizione.
create unique index sottocategorie_un_insieme_per_tipo
  on public.sottocategorie (sessione_id, tipo)
  where tipo in ('cibo', 'bevanda');

-- 9) Le edizioni nuove nascono coi due insiemi gia' apparecchiati. Il posto
--    giusto e' un trigger: creaEdizione dall'app e' un insert nudo, e
--    qualunque percorso futuro — SQL editor compreso — passa comunque di qui.
create or replace function public.sessioni_insiemi_fissi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sottocategorie (sessione_id, nome, tipo, colore, ordine)
  values (new.id, 'Cibo',    'cibo',    '#B84A10', 1),
         (new.id, 'Bevande', 'bevanda', '#0B63A8', 2)
  on conflict (sessione_id, nome) do nothing;
  return new;
end;
$$;

create trigger sessioni_insiemi_fissi
  after insert on public.sessioni
  for each row execute function public.sessioni_insiemi_fissi();

-- 10) copia_catalogo si adegua: la destinazione non e' mai piu' vergine (il
--     trigger le ha gia' dato i due insiemi), quindi «gia' avviata» si legge
--     dal contenuto vero; gli insiemi fissi si riusano per nome; il colore
--     viaggia col prodotto.
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

  if exists (
       select 1 from public.prodotti p
       join public.sottocategorie s on s.id = p.sottocategoria_id
       where s.sessione_id = p_a)
     or exists (select 1 from public.sottocategorie where sessione_id = p_a and tipo = 'altro')
     or exists (select 1 from public.offerte         where sessione_id = p_a)
     or exists (select 1 from public.categorie_costo where sessione_id = p_a)
  then
    raise exception 'la sessione di destinazione ha gia un catalogo';
  end if;

  insert into public.sottocategorie (sessione_id, nome, tipo, colore, ordine)
  select p_a, nome, tipo, colore, ordine
  from public.sottocategorie where sessione_id = p_da
  on conflict (sessione_id, nome) do nothing;

  insert into public.prodotti (sottocategoria_id, nome, prezzo_cent, colore, ordine)
  select sn.id, p.nome, p.prezzo_cent, p.colore, p.ordine
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
