-- 009_sessioni_e_catalogo.sql
-- La sagra e' un giorno all'anno. Una sessione e' un'edizione, e il catalogo
-- appartiene alla sessione: cambiare il listino nel 2027 non deve muovere di
-- un centesimo quello che si e' venduto nel 2026.

create table public.sessioni (
  id         uuid primary key default gen_random_uuid(),
  anno       int  not null unique,
  nome       text not null,
  -- bozza: si sta configurando. aperta: si registra. chiusa: sola lettura.
  stato      text not null default 'bozza'
             check (stato in ('bozza', 'aperta', 'chiusa')),
  aperta_il  timestamptz,
  chiusa_il  timestamptz,
  created_at timestamptz not null default now()
);

-- Una sola sessione aperta per volta: i movimenti devono sapere senza
-- ambiguita' a quale edizione appartengono.
create unique index sessioni_una_sola_aperta
  on public.sessioni (stato) where stato = 'aperta';

create table public.categorie (
  id          uuid primary key default gen_random_uuid(),
  sessione_id uuid not null references public.sessioni(id) on delete cascade,
  nome        text not null,
  ordine      int  not null default 0,
  unique (sessione_id, nome)
);

create table public.sottocategorie (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorie(id) on delete cascade,
  nome         text not null,
  -- Il ventaglio e' chiuso per costruzione: sette tinte misurate, distinguibili
  -- fra loro anche in deuteranopia. Un selettore libero produrrebbe due verdi
  -- identici e nessuno se ne accorgerebbe fino alla sera della sagra.
  colore       text not null check (colore in (
    '#B84A10', '#0B63A8', '#D9A020', '#4A4FB5', '#8A6A0E', '#4FA0DC', '#A02B57'
  )),
  ordine       int  not null default 0,
  unique (categoria_id, nome)
);

create table public.prodotti (
  id                uuid primary key default gen_random_uuid(),
  sottocategoria_id uuid not null references public.sottocategorie(id) on delete cascade,
  nome              text not null,
  -- Nullo si tollera solo in bozza: apri_sessione() rifiuta di aprire finche'
  -- un prodotto non nascosto e' senza prezzo. Cosi' si puo' buttare giu' il
  -- listino a nomi e mettere i prezzi dopo, senza inventare uno zero.
  prezzo_cent       int check (prezzo_cent > 0),
  ordine            int  not null default 0,
  -- Le sarde finiscono alle 21:30: si nasconde, non si cancella. Cancellare
  -- porterebbe via le righe che lo citano.
  nascosto          boolean not null default false,
  unique (sottocategoria_id, nome)
);

create table public.offerte (
  id          uuid primary key default gen_random_uuid(),
  sessione_id uuid not null references public.sessioni(id) on delete cascade,
  nome        text not null,
  prezzo_cent int  not null check (prezzo_cent > 0),
  ordine      int  not null default 0,
  nascosta    boolean not null default false,
  unique (sessione_id, nome)
);

-- Un'offerta pesca da una sottocategoria, non da prodotti fissi: "3 cicchetti
-- a scelta" resta registrabile qualunque cicchetto scelga il cliente, e il
-- dato per prodotto non si falsa.
create table public.offerte_componenti (
  id                uuid primary key default gen_random_uuid(),
  offerta_id        uuid not null references public.offerte(id) on delete cascade,
  sottocategoria_id uuid not null references public.sottocategorie(id) on delete cascade,
  quantita          int  not null check (quantita > 0),
  unique (offerta_id, sottocategoria_id)
);

-- La sessione della sottocategoria sta due livelli piu' su (sottocategoria ->
-- categoria -> sessione), quindi nessuna chiave esterna puo' arrivarci: senza
-- questo controllo un'offerta del 2027 potrebbe pescare da una sottocategoria
-- del 2026. Il risultato sarebbe un bottone che non registra niente, e lo si
-- scoprirebbe la sera della sagra.
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

  select c.sessione_id into v_sessione_sotto
  from public.sottocategorie s
  join public.categorie c on c.id = s.categoria_id
  where s.id = new.sottocategoria_id;

  if v_sessione_offerta is distinct from v_sessione_sotto then
    raise exception 'la sottocategoria appartiene a una sessione diversa dall''offerta';
  end if;

  return new;
end;
$$;

create trigger offerte_componenti_coerenti
  before insert or update on public.offerte_componenti
  for each row execute function public.offerte_componenti_stessa_sessione();

-- Il controllo qui sopra guarda la riga nel momento in cui viene scritta, e
-- non basta da solo: spostando dopo l'offerta o la sottocategoria in un'altra
-- edizione si ricrea lo stesso disallineamento senza toccare offerte_componenti.
--
-- La regola vera e' piu' semplice di un trigger per ogni lato: una riga del
-- catalogo appartiene al ramo in cui e' nata. Si rinomina, si riprezza, si
-- nasconde, si riordina — non si trapianta. Le edizioni nuove nascono da
-- copia_catalogo(), che scrive righe nuove; nessuno ha motivo di spostare le
-- vecchie, e permetterlo aprirebbe soltanto una porta a incoerenze silenziose.
-- Il secondo argomento e' il nome della cosa in italiano: nel messaggio d'errore
-- lo legge un capo stand che sta preparando il listino, non chi ha scritto la
-- tabella, e `sessione_id` con il trattino basso non gli dice niente.
create or replace function public.colonna_immutabile()
returns trigger
language plpgsql
as $$
begin
  -- Un nome di colonna sbagliato darebbe NULL da entrambe le parti e il
  -- confronto passerebbe sempre, in silenzio, per sempre: un trigger che
  -- compare fra i trigger della tabella e non fa niente e' peggio che non
  -- averlo, perche' si legge come una protezione. Meglio rumoroso al primo uso.
  if not jsonb_exists(to_jsonb(new), tg_argv[0]) then
    raise exception 'colonna_immutabile(): la colonna % non esiste su %',
      tg_argv[0], tg_table_name;
  end if;

  if to_jsonb(new) ->> tg_argv[0] is distinct from to_jsonb(old) ->> tg_argv[0] then
    raise exception
      '% non si cambia dopo la creazione: il catalogo non si sposta fra rami, si crea una riga nuova',
      tg_argv[1];
  end if;
  return new;
end;
$$;

create trigger categorie_sessione_immutabile
  before update on public.categorie
  for each row execute function public.colonna_immutabile('sessione_id', 'la sessione');

create trigger sottocategorie_categoria_immutabile
  before update on public.sottocategorie
  for each row execute function public.colonna_immutabile('categoria_id', 'la categoria');

create trigger prodotti_sottocategoria_immutabile
  before update on public.prodotti
  for each row execute function public.colonna_immutabile('sottocategoria_id', 'la sottocategoria');

create trigger offerte_sessione_immutabile
  before update on public.offerte
  for each row execute function public.colonna_immutabile('sessione_id', 'la sessione');

create index prodotti_per_sottocategoria on public.prodotti (sottocategoria_id, ordine);
create index sottocategorie_per_categoria on public.sottocategorie (categoria_id, ordine);
create index categorie_per_sessione on public.categorie (sessione_id, ordine);
-- Le offerte si disegnano a bottoni come tutto il resto, e si ordinano.
create index offerte_per_sessione on public.offerte (sessione_id, ordine);
