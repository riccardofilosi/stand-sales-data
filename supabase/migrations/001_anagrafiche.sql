-- 001_anagrafiche.sql
-- Utenti, edizioni, prodotti, prezzi versionati, offerte.

create type public.user_role as enum ('gestore', 'operatore');
create type public.product_category as enum ('spritz', 'cicchetto', 'altro');

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  role       public.user_role not null default 'operatore',
  created_at timestamptz not null default now()
);

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  data_inizio date not null,
  data_fine   date not null,
  attivo      boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint date_coerenti check (data_fine >= data_inizio)
);

-- Un solo evento attivo per volta: le vendite devono sapere senza ambiguità
-- a quale edizione appartengono.
create unique index events_un_solo_attivo
  on public.events (attivo) where attivo;

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  categoria  public.product_category not null,
  emoji      text,
  colore     text,
  ordine     int not null default 0,
  attivo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- I prezzi non vengono mai sovrascritti: si chiude il periodo corrente e se
-- ne apre uno nuovo. Così una vendita di ieri resta valutata al prezzo di ieri.
create table public.price_history (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  prezzo_cent int not null check (prezzo_cent > 0),
  valido_da  timestamptz not null default now(),
  valido_a   timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  constraint periodo_coerente check (valido_a is null or valido_a > valido_da)
);

-- Esattamente un prezzo aperto per prodotto.
create unique index price_history_un_solo_corrente
  on public.price_history (product_id) where valido_a is null;

create index price_history_per_prodotto
  on public.price_history (product_id, valido_da desc);

create table public.offers (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  categoria_ammessa public.product_category not null,
  quantita          int not null check (quantita > 1),
  prezzo_cent       int not null check (prezzo_cent > 0),
  attiva            boolean not null default true,
  created_at        timestamptz not null default now()
);
