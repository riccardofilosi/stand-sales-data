-- 017_stato_operatori.sql
-- Decisione 31: gli account li crea il capo stand in anticipo, e prima della
-- serata deve poter vedere chi e' gia' entrato almeno una volta. Il dato sta
-- in auth.users.last_sign_in_at, che nessun client puo' leggere: senza questa
-- funzione l'unico modo di saperlo sarebbe chiederlo a voce dietro il banco,
-- che e' esattamente il momento che la decisione vuole evitare.

create or replace function public.stato_operatori()
returns table (id uuid, nome text, ruolo text, primo_accesso timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- security definer scavalca la RLS: senza questo controllo la funzione
  -- diventerebbe una finestra su auth.users per chiunque abbia la chiave anon.
  if not public.is_gestore() then
    raise exception 'solo il gestore vede lo stato degli operatori';
  end if;

  return query
    select p.id, p.nome, p.role::text, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.nome;
end;
$$;

revoke execute on function public.stato_operatori() from public, anon;
grant  execute on function public.stato_operatori() to authenticated;
