-- 015_audit_e_seed.sql
-- Trigger di audit sulle tabelle nuove, piu' un listino di partenza.

-- La riapertura di una sessione chiusa e' il gesto piu' delicato che il
-- gestore possa fare: da quel momento lo storico torna scrivibile.
create trigger audit_sessioni
  after insert or update on public.sessioni
  for each row execute function public.scrivi_audit();

-- Un prezzo cambiato a meta' serata cambia il valore di tutto quello che si
-- vende dopo: deve restare scritto chi l'ha toccato e quando.
create trigger audit_prodotti
  after insert or update or delete on public.prodotti
  for each row execute function public.scrivi_audit();

create trigger audit_offerte
  after insert or update or delete on public.offerte
  for each row execute function public.scrivi_audit();

create trigger audit_offerte_componenti
  after insert or update or delete on public.offerte_componenti
  for each row execute function public.scrivi_audit();

create trigger audit_acquisti
  after insert or update or delete on public.acquisti
  for each row execute function public.scrivi_audit();

-- Le insert sui movimenti non si registrano: la riga di movimento e' gia' il
-- proprio documento. Update e delete non possono arrivare da un ruolo
-- applicativo — sono revocati — quindi se compaiono qui e' successo qualcosa
-- da fuori, ed e' esattamente il caso in cui lo si vuole sapere.
create trigger audit_movimenti
  after update or delete on public.movimenti
  for each row execute function public.scrivi_audit();

-- ---------------------------------------------------------------------------
-- Listino di partenza. Resta in bozza: e' apri_sessione() a decidere se il
-- catalogo e' completo, e serve poterlo mettere alla prova.
-- ---------------------------------------------------------------------------
insert into public.sessioni (id, anno, nome, stato) values
  ('5e5510e0-0000-4000-8000-000000000001', 2026, 'Sagra 2026', 'bozza');

insert into public.categorie (id, sessione_id, nome, ordine) values
  ('ca7e0000-0000-4000-8000-000000000001', '5e5510e0-0000-4000-8000-000000000001', 'Bevande', 1),
  ('ca7e0000-0000-4000-8000-000000000002', '5e5510e0-0000-4000-8000-000000000001', 'Cibo', 2);

insert into public.sottocategorie (id, categoria_id, nome, colore, ordine) values
  ('50c70000-0000-4000-8000-000000000001', 'ca7e0000-0000-4000-8000-000000000001', 'Spritz',      '#B84A10', 1),
  ('50c70000-0000-4000-8000-000000000002', 'ca7e0000-0000-4000-8000-000000000001', 'Analcolici',  '#4FA0DC', 2),
  ('50c70000-0000-4000-8000-000000000003', 'ca7e0000-0000-4000-8000-000000000002', 'Cicchetti',   '#A02B57', 1);

insert into public.prodotti (id, sottocategoria_id, nome, prezzo_cent, ordine) values
  ('9700d000-0000-4000-8000-000000000001', '50c70000-0000-4000-8000-000000000001', 'Aperol',   600, 1),
  ('9700d000-0000-4000-8000-000000000002', '50c70000-0000-4000-8000-000000000001', 'Campari',  600, 2),
  ('9700d000-0000-4000-8000-000000000003', '50c70000-0000-4000-8000-000000000001', 'Select',   600, 3),
  ('9700d000-0000-4000-8000-000000000004', '50c70000-0000-4000-8000-000000000002', 'Acqua',    150, 1),
  ('9700d000-0000-4000-8000-000000000005', '50c70000-0000-4000-8000-000000000003', 'Baccala',  300, 1),
  ('9700d000-0000-4000-8000-000000000006', '50c70000-0000-4000-8000-000000000003', 'Sarde',    300, 2),
  ('9700d000-0000-4000-8000-000000000007', '50c70000-0000-4000-8000-000000000003', 'Polpetta', 250, 3);

insert into public.offerte (id, sessione_id, nome, prezzo_cent, ordine) values
  ('0ffe0000-0000-4000-8000-000000000001', '5e5510e0-0000-4000-8000-000000000001', '3 cicchetti', 800, 1);

insert into public.offerte_componenti (offerta_id, sottocategoria_id, quantita) values
  ('0ffe0000-0000-4000-8000-000000000001', '50c70000-0000-4000-8000-000000000003', 3);

insert into public.categorie_costo (sessione_id, nome, ordine) values
  ('5e5510e0-0000-4000-8000-000000000001', 'Bevande',  1),
  ('5e5510e0-0000-4000-8000-000000000001', 'Cibo',     2),
  ('5e5510e0-0000-4000-8000-000000000001', 'Monouso',  3),
  ('5e5510e0-0000-4000-8000-000000000001', 'Ghiaccio', 4);
