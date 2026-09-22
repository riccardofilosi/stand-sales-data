-- 023_acquisti_semplici.sql
--
-- Gli acquisti si scrivono come si raccontano: cosa, quanto, da chi, quando,
-- e una nota. La categoria di costo era un piano dei conti in miniatura da
-- configurare prima di poter registrare la prima fattura: un ostacolo, non
-- un'informazione — il fornitore nel suo campo dice di piu'.
--
-- Gia' che si passa: cade anche `sottocategorie.colore`, tenuta in vita
-- dalla 022 solo per la finestra fra migrazione e deploy, ormai chiusa.

-- 1) Il fornitore ha il suo campo (finora si arrangiava dentro le note).
--    Confezioni resta in tabella per lo storico ma smette di essere chiesta:
--    il default la copre.
alter table public.acquisti
  add column fornitore text,
  alter column confezioni set default 1;

-- 2) La categoria se ne va: prima la colonna che la cita, poi la tabella.
--    `cascade` porta via le policy e gli eventuali resti.
alter table public.acquisti drop column categoria_costo_id;
drop table public.categorie_costo cascade;

-- 3) Il colore superstite delle famiglie (022, decisione 2): via.
alter table public.sottocategorie drop column colore;

-- 4) Le due funzioni che citavano le colonne cadute si ridefiniscono intere.

create or replace function public.sessioni_insiemi_fissi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sottocategorie (sessione_id, nome, tipo, ordine)
  values (new.id, 'Cibo',    'cibo',    1),
         (new.id, 'Bevande', 'bevanda', 2)
  on conflict (sessione_id, nome) do nothing;
  return new;
end;
$$;

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
     or exists (select 1 from public.offerte where sessione_id = p_a)
  then
    raise exception 'la sessione di destinazione ha gia un catalogo';
  end if;

  insert into public.sottocategorie (sessione_id, nome, tipo, ordine)
  select p_a, nome, tipo, ordine
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
end;
$$;
