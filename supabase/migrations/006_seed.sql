-- 006_seed.sql
-- Prodotti, prezzi e offerte di partenza. I prezzi sono modificabili
-- dall'interfaccia: questi servono solo ad avere qualcosa su cui lavorare.

insert into public.events (nome, data_inizio, data_fine, attivo)
values ('Sagra 2026', '2026-08-20', '2026-08-23', true);

insert into public.cost_categories (nome, ordine) values
  ('Primari', 1),
  ('Cibo', 2),
  ('Supporto', 3);

with nuovi as (
  insert into public.products (nome, categoria, emoji, colore, ordine) values
    ('Spritz Aperol',   'spritz',    '🍹', '#E85D04', 1),
    ('Spritz Campari',  'spritz',    '🍸', '#B5121B', 2),
    ('Spritz Select',   'spritz',    '🥂', '#D9591C', 3),
    ('Baccalà',         'cicchetto', '🐟', '#1F6F8B', 4),
    ('Sarde in saor',   'cicchetto', '🍥', '#0E6E6B', 5),
    ('Polpetta',        'cicchetto', '🧆', '#8A5A12', 6),
    ('Uovo e acciuga',  'cicchetto', '🥚', '#B07D0A', 7),
    ('Acqua',           'altro',     '💧', '#4A6670', 8)
  returning id, categoria
)
insert into public.price_history (product_id, prezzo_cent)
select id, case categoria
             when 'spritz'    then 400
             when 'cicchetto' then 200
             else 100
           end
from nuovi;

insert into public.offers (nome, categoria_ammessa, quantita, prezzo_cent) values
  ('3 cicchetti', 'cicchetto', 3, 500);
