-- 019_ruoli_consiglio.sql
--
-- L'organigramma delle specifiche ha tre livelli, non due: il capo, il
-- consiglio (una o piu' persone), gli operatori. E due poteri passano SOLO dal
-- capo — approvare un iscritto e promuovere qualcuno a consigliere. Finora
-- qualunque `gestore` poteva fare entrambe le cose, cioe' l'esatto contrario
-- di «passa tutto da me».
--
-- ATTENZIONE al pacchetto in transazione unica, stessa nota della 018: un
-- valore nuovo dell'enum si puo' AGGIUNGERE dentro la transazione ma non
-- USARE finche' non e' committato. E non basta metterlo dentro un corpo di
-- funzione: Postgres controlla i corpi gia' alla creazione e rifiuta con
-- «unsafe use of new value "capo"».
--
-- Per questo ogni confronto qui sotto passa da `role::text`: il cast produce
-- l'etichetta a runtime e il letterale resta una stringa, non un valore
-- dell'enum. Costa un cast per chiamata su una tabella di dieci righe, e in
-- cambio la migrazione entra tutta insieme invece di chiedere due commit.

-- 1) `gestore` diventa `consigliere`. E' un RENAME, non un ADD: le righe
--    esistenti cambiano etichetta da sole, senza UPDATE, e senza che questa
--    transazione debba nominare un valore che ha appena creato.
alter type public.user_role rename value 'gestore' to 'consigliere';

-- 2) Il capo. Nasce non assegnato: si designa a mano dopo il commit, con
--    l'UPDATE scritto nel README. Assegnarlo qui significherebbe usarlo.
alter type public.user_role add value if not exists 'capo';

-- 3) Uno solo, e non e' un vezzo: «passa tutto da me» con due capi non e' piu'
--    una catena di comando, e chi approva chi diventa indecidibile.
--
--    La guardia e' un trigger e non un indice unico parziale, che sarebbe piu'
--    forte: il predicato di un indice deve essere IMMUTABLE, e il cast a text
--    che serve a nominare 'capo' qui dentro non lo e'. Il rischio residuo e'
--    la corsa fra due promozioni simultanee, che a un capo solo che promuove
--    dal proprio telefono non capita. Quando servira' davvero, l'indice si
--    aggiunge in una migrazione successiva: li' il valore sara' committato.
create or replace function public.un_solo_capo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role::text = 'capo' and exists (
    select 1 from public.profiles where role::text = 'capo' and id <> new.id
  ) then
    raise exception 'c e gia un capo: prima va tolto a chi lo ha adesso';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_un_solo_capo on public.profiles;
create trigger profiles_un_solo_capo
  before insert or update of role on public.profiles
  for each row execute function public.un_solo_capo();

-- 4) I due poteri che non si delegano.
create or replace function public.is_capo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role::text = 'capo' from public.profiles where id = auth.uid()),
    false
  )
$$;

revoke execute on function public.is_capo() from public, anon;
grant  execute on function public.is_capo() to authenticated;

-- 5) `is_gestore()` sopravvive col nome vecchio e con il significato nuovo:
--    «sta nel consiglio». Otto file la nominano — le policy del catalogo,
--    l'apertura e la chiusura della sessione, lo storno delle righe altrui, la
--    lettura del registro di audit — e in tutti la domanda vera e' sempre
--    stata «puo' decidere prima della serata?». Quella persona ora si chiama
--    consigliere, ma l'insieme e' lo stesso: rinominare la funzione in otto
--    file non cambierebbe una sola regola, e ne romperebbe qualcuna per
--    distrazione.
create or replace function public.is_gestore()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role::text in ('consigliere', 'capo') from public.profiles where id = auth.uid()),
    false
  )
$$;

-- 6) Approvato, a qualunque titolo. Il capo entra nell'insieme: senza, sarebbe
--    l'unico a non poter registrare una vendita nella propria sagra.
create or replace function public.is_operativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role::text in ('operatore', 'consigliere', 'capo')
       from public.profiles where id = auth.uid()),
    false
  )
$$;

-- 7) Le persone le tocca il capo, e basta. Questa e' l'unica policy il cui
--    insieme si restringe davvero: prima bastava essere gestore per approvare
--    un iscritto o promuovere un pari grado.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_capo()) with check (public.is_capo());

-- Chi non gestisce le persone non ha ragione di leggerne i ruoli. I nomi
-- restano visibili a tutti dalla vista `operatori`, che serve a scrivere
-- «registrato da» accanto a una riga.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_capo());

-- 8) La finestra su auth.users si stringe allo stesso modo: e' il pannello
--    delle persone, e quello e' del capo.
create or replace function public.stato_operatori()
returns table (id uuid, nome text, ruolo text, primo_accesso timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- security definer scavalca la RLS: senza questo controllo la funzione
  -- diventerebbe una finestra su auth.users per chiunque abbia la chiave anon.
  if not public.is_capo() then
    raise exception 'solo il capo vede lo stato degli operatori';
  end if;

  return query
    select p.id, p.nome, p.role::text, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.nome;
end;
$$;
