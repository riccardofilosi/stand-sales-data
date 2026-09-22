-- 008_demolizione.sql
--
-- Il modello vecchio era costruito attorno alla vendita come documento
-- (testata + righe) e attorno a una distinta base delle materie prime.
-- Il modello nuovo raccoglie movimenti singoli e non stima nulla: quasi
-- nulla si poteva riusare, e rattoppare sarebbe costato piu' che rifare.
--
-- Restano in piedi profiles, audit_log, i ruoli e le funzioni di ruolo.

-- Le tabelle per prime: si portano via i propri trigger. Togliere prima
-- purchases_evento_corrente() fallirebbe, perche' il trigger su purchases
-- dipende da lei.
-- cascade serve per le chiavi esterne che puntano a queste tabelle da fuori.
-- Indici e policy cadono comunque: appartengono alla tabella, non la puntano.
drop table if exists public.pending_changes cascade;
drop table if exists public.purchases       cascade;
drop table if exists public.supplies        cascade;
drop table if exists public.cost_categories cascade;
drop table if exists public.sale_items      cascade;
drop table if exists public.sales           cascade;
drop table if exists public.price_history   cascade;
drop table if exists public.offers          cascade;
drop table if exists public.products        cascade;
drop table if exists public.events          cascade;

-- Ora le funzioni, rimaste senza dipendenti.
drop function if exists public.storna_vendita(uuid);
drop function if exists public.registra_vendita(jsonb);
drop function if exists public.purchases_evento_corrente();

-- E per ultimo il tipo che registra_vendita dichiarava.
drop type if exists public.riga_valutata;
drop type if exists public.change_status;
drop type if exists public.change_type;

-- La ragione per cui questo enum se ne va: per aggiungere "Panini" al listino
-- bisognava ricompilare. Categorie e sottocategorie diventano dati.
drop type if exists public.product_category;
