-- 010_movimenti_e_acquisti.sql
-- Una sola tabella per due canali. La vendita porta un prezzo, il fuori cassa
-- porta una causale: sono lo stesso fatto (un pezzo e' uscito) misurato in due
-- modi, e tenerli separati costringerebbe a sommarli a mano ogni volta.

-- Nessuna chiave esterna qui sotto porta `on delete cascade`, al contrario del
-- catalogo in 009 che casca tutto insieme alla sessione. E' voluto: e' proprio
-- questo che rende indistruttibile una sessione con dei movimenti dentro.
-- Cancellare l'edizione 2026 fallisce finche' esiste una riga registrata, e la
-- cascata del catalogo non arriva mai a scattare.
create table public.movimenti (
  -- Nessun default: l'identificativo lo genera il dispositivo prima di mettere
  -- la riga in coda. E' cosi' che il rinvio di una riga gia' arrivata non la
  -- duplica — la chiave primaria fa da ricevuta.
  id            uuid primary key,
  sessione_id   uuid not null references public.sessioni(id),
  prodotto_id   uuid not null references public.prodotti(id),
  -- Il segno sta QUI e solo qui: negativa su uno storno, positiva altrove.
  -- Cosi' `sum(quantita)` da' i pezzi netti e `sum(quantita * prezzo_cent)`
  -- l'incasso netto, senza casi particolari da ricordare. Se anche il prezzo
  -- cambiasse segno i due meno si annullerebbero e uno storno raddoppierebbe
  -- l'incasso invece di azzerarlo.
  quantita      int  not null check (quantita <> 0),
  -- Prezzo UNITARIO congelato, sempre positivo. Su una riga dentro un'offerta
  -- e' la quota spalmata, non il prezzo di listino.
  -- Zero e' ammesso: in un'offerta molto scontata la quota di un articolo da
  -- pochi centesimi puo' arrotondare a zero, e un vincolo `> 0` farebbe
  -- fallire una registrazione vera alle dieci di sera.
  prezzo_cent   int check (prezzo_cent is null or prezzo_cent >= 0),
  canale        text not null check (canale in ('vendita', 'fuori_cassa')),
  causale       text check (causale in ('omaggio', 'interno')),
  -- Lega le righe nate da un solo gesto: le tre righe di un'offerta restano
  -- riconoscibili come offerta anche dopo l'export.
  gruppo        uuid not null,
  offerta_id    uuid references public.offerte(id),
  operatore_id  uuid not null references public.profiles(id),
  -- Ora del dispositivo al tocco, non ora di arrivo: una coda smaltita alle
  -- 21:22 non deve ammassare sulla fascia sbagliata dieci minuti di vendite.
  registrato_il timestamptz not null,
  ricevuto_il   timestamptz not null default now(),
  storna_id     uuid references public.movimenti(id),
  -- Una riga che storna se stessa e' un cappio: manda in ciclo qualunque query
  -- che risalga la catena degli annulli, e non significa niente.
  constraint niente_autostorno check (storna_id is null or storna_id <> id),
  constraint canale_coerente check (
    (canale = 'vendita'     and prezzo_cent is not null and causale is null) or
    (canale = 'fuori_cassa' and prezzo_cent is null     and causale is not null)
  ),
  -- Il fuori cassa non ha prezzo, quindi non puo' stare dentro un'offerta.
  constraint offerta_solo_in_vendita check (
    offerta_id is null or canale = 'vendita'
  )
);

create index movimenti_per_sessione on public.movimenti (sessione_id, registrato_il);
create index movimenti_per_gruppo   on public.movimenti (gruppo);

-- Una riga si storna una volta sola: senza questo, due tocchi sul bottone di
-- annullo porterebbero via il doppio.
create unique index movimenti_uno_storno_per_riga
  on public.movimenti (storna_id) where storna_id is not null;

create table public.categorie_costo (
  id          uuid primary key default gen_random_uuid(),
  sessione_id uuid not null references public.sessioni(id) on delete cascade,
  nome        text not null,
  ordine      int  not null default 0,
  unique (sessione_id, nome)
);

create table public.acquisti (
  id                  uuid primary key default gen_random_uuid(),
  sessione_id         uuid not null references public.sessioni(id),
  articolo            text not null,
  categoria_costo_id  uuid not null references public.categorie_costo(id),
  confezioni          int  not null check (confezioni > 0),
  -- 1 per chi compra sciolto. Il pezzo base e' cio' che un domani si divide
  -- per i pezzi venduti: senza, il coefficiente non si ricava.
  pezzi_per_confezione int not null default 1 check (pezzi_per_confezione > 0),
  pezzi_totali        int generated always as (confezioni * pezzi_per_confezione) stored,
  costo_cent          int  not null check (costo_cent >= 0),
  -- Data del documento, non della registrazione: la fattura del 14 agosto
  -- vale il 14 agosto anche se la si inserisce il 19.
  data_documento      date not null,
  note                text,
  -- Di norma chi registra e' chi sta scrivendo, e non deve digitarlo. Resta
  -- sovrascrivibile perche' il campo dice "chi ha protocollato la fattura", che
  -- puo' legittimamente non essere chi ha in mano il telefono. Solo il gestore
  -- scrive qui (policy in 011), quindi non e' una via per intestare spese ad altri.
  creato_da           uuid not null references public.profiles(id) default auth.uid(),
  created_at          timestamptz not null default now()
);

create index acquisti_per_sessione on public.acquisti (sessione_id, data_documento desc);
