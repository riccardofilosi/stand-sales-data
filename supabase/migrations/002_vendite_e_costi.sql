-- 002_vendite_e_costi.sql
-- Vendite, acquisti, coda approvazioni, registro di audit.

create type public.change_status as enum ('pending', 'approvato', 'rifiutato');
create type public.change_type   as enum ('prezzo', 'prodotto', 'offerta', 'annullo_vendita');

create table public.sales (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id),
  operator_id uuid not null references public.profiles(id),
  totale_cent int not null,
  storno_di   uuid references public.sales(id),
  created_at  timestamptz not null default now(),
  -- Una vendita normale ha totale positivo, uno storno negativo.
  -- Sommare la colonna dà l'incasso reale senza casi particolari.
  constraint segno_coerente check (
    (storno_di is null     and totale_cent >  0) or
    (storno_di is not null and totale_cent <  0)
  )
);

create index sales_per_evento on public.sales (event_id, created_at desc);
create unique index sales_un_solo_storno on public.sales (storno_di)
  where storno_di is not null;

create table public.sale_items (
  id                   uuid primary key default gen_random_uuid(),
  sale_id              uuid not null references public.sales(id) on delete cascade,
  product_id           uuid not null references public.products(id),
  offer_id             uuid references public.offers(id),
  quantita             int not null check (quantita > 0),
  -- Prezzo congelato al momento della vendita: se il prezzo cambia dopo,
  -- lo storico resta corretto.
  prezzo_unitario_cent int not null
);

create index sale_items_per_vendita on public.sale_items (sale_id);

create table public.cost_categories (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  ordine int not null default 0
);

-- Materia prima acquistata. `resa` collega l'acquisto alla vendita:
-- una bottiglia di Aperol produce N spritz.
create table public.supplies (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  category_id           uuid not null references public.cost_categories(id),
  product_id            uuid references public.products(id),
  resa                  int check (resa > 0),
  pezzi_per_confezione  int not null default 1 check (pezzi_per_confezione > 0),
  costo_confezione_cent int not null check (costo_confezione_cent >= 0),
  attivo                boolean not null default true
);

create table public.purchases (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id),
  supply_id        uuid not null references public.supplies(id),
  quantita         numeric(10,2) not null check (quantita > 0),
  costo_totale_cent int not null check (costo_totale_cent >= 0),
  data             date not null default current_date,
  operator_id      uuid not null references public.profiles(id),
  scontrino_path   text,
  created_at       timestamptz not null default now()
);

create index purchases_per_evento on public.purchases (event_id, data desc);

create table public.pending_changes (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.change_type not null,
  payload        jsonb not null,
  richiesto_da   uuid not null references public.profiles(id),
  richiesto_at   timestamptz not null default now(),
  stato          public.change_status not null default 'pending',
  deciso_da      uuid references public.profiles(id),
  deciso_at      timestamptz,
  motivo_rifiuto text,
  -- Chi ha chiesto non può decidere. Vale per le richieste degli operatori:
  -- le modifiche del gestore non passano dalla coda (vedi spec, sezione 2).
  constraint niente_autoapprovazione check (deciso_da is null or deciso_da <> richiesto_da),
  constraint decisione_coerente check (
    (stato =  'pending' and deciso_da is null     and deciso_at is null) or
    (stato <> 'pending' and deciso_da is not null and deciso_at is not null)
  )
);

create index pending_changes_aperte on public.pending_changes (richiesto_at desc)
  where stato = 'pending';

-- Registro immutabile. Scritto solo dai trigger, nessun grant di scrittura
-- a nessun ruolo applicativo.
create table public.audit_log (
  id        bigint generated always as identity primary key,
  tabella   text not null,
  record_id text not null,
  azione    text not null,
  attore    uuid,
  prima     jsonb,
  dopo      jsonb,
  at        timestamptz not null default now()
);

create index audit_log_recente on public.audit_log (at desc);
