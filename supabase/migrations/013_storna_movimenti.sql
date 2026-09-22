-- 013_storna_movimenti.sql
--
-- Formato dell'argomento:
-- [{"id":"uuid nuovo","storna_id":"uuid della riga da annullare",
--   "registrato_il":"2026-08-08T22:41:00.000Z"}]
--
-- Annullare non e' cancellare: si aggiunge una riga speculare con la quantita'
-- di segno opposto e lo stesso prezzo. La riga sbagliata resta accanto alla sua
-- correzione, e chi ha annullato cosa resta scritto. E' il prezzo per potersi
-- fidare dei totali.

create or replace function public.storna_movimenti(p_righe jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessione uuid;
  v_aperta_il timestamptz;
  v_inserite int;
begin
  if auth.uid() is null then
    raise exception 'non autenticato';
  end if;

  -- `p_righe is null` va per primo: senza, jsonb_typeof(null) e' null, l'if
  -- non scatta e la funzione tornerebbe 0 come se il lotto fosse gia' passato.
  if p_righe is null
     or jsonb_typeof(p_righe) <> 'array'
     or jsonb_array_length(p_righe) = 0 then
    raise exception 'nessuna riga da stornare';
  end if;

  select id, aperta_il into v_sessione, v_aperta_il
  from public.sessioni where stato = 'aperta';
  if v_sessione is null then
    raise exception 'nessuna sessione aperta';
  end if;

  -- Una riga senza l'ora del tocco finirebbe stampata `now()` in silenzio:
  -- `least(null, now())` in Postgres ignora il null invece di propagarlo.
  if exists (
    select 1 from jsonb_array_elements(p_righe) r
    where nullif(r->>'registrato_il', '') is null
  ) then
    raise exception 'una riga non porta l ora del tocco';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    left join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.id is null
  ) then
    raise exception 'una riga da stornare non esiste';
  end if;

  -- Chiusa la sessione, i suoi totali non si toccano piu'. Senza questo
  -- controllo bastava indicare una riga dell'anno scorso: la sessione aperta
  -- faceva solo da lasciapassare e lo storno si scriveva dentro l'edizione
  -- vecchia, riaprendo un conto che era stato chiuso.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.sessione_id <> v_sessione
  ) then
    raise exception 'si annulla solo dentro la sessione aperta';
  end if;

  -- Uno storno non si storna: si tornerebbe al punto di partenza lasciando
  -- tre righe dove ne bastava una, e nessuno saprebbe piu' leggere la storia.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.storna_id is not null
  ) then
    raise exception 'uno storno non si storna';
  end if;

  -- Ognuno annulla le proprie righe. Il gestore annulla quelle di chiunque:
  -- e' lui a rispondere della cassa a fine serata.
  if not public.is_gestore() and exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.id = (r->>'storna_id')::uuid
    where m.operatore_id <> auth.uid()
  ) then
    raise exception 'si annullano solo le proprie righe';
  end if;

  -- Un secondo tocco sul bottone di annullo genera una busta nuova, con un id
  -- nuovo: `on conflict (id)` non la riconosce come ripetizione e l'indice
  -- unico la respingerebbe con un errore di chiave duplicata, che nessuno sa
  -- leggere. Meglio dirlo prima e con parole.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    join public.movimenti m on m.storna_id = (r->>'storna_id')::uuid
  ) then
    raise exception 'una riga indicata e gia stata annullata';
  end if;

  -- Due annulli della stessa riga dentro lo stesso lotto: senza questo
  -- controllo l'indice unico farebbe abortire l'intero insert, portandosi via
  -- anche gli annulli buoni che viaggiavano insieme.
  if exists (
    select 1
    from jsonb_array_elements(p_righe) r
    group by (r->>'storna_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'lo stesso movimento compare due volte fra gli annulli';
  end if;

  insert into public.movimenti (
    id, sessione_id, prodotto_id, quantita, prezzo_cent,
    canale, causale, gruppo, offerta_id, operatore_id, registrato_il, storna_id
  )
  select
    (r->>'id')::uuid,
    m.sessione_id,
    m.prodotto_id,
    -- Cambia segno la quantita', NON il prezzo. Girare tutti e due farebbe
    -- tornare positivo il prodotto quantita * prezzo, e lo storno
    -- raddoppierebbe l'incasso invece di annullarlo.
    -m.quantita,
    m.prezzo_cent,
    m.canale,
    m.causale,
    -- Lo storno e' un gesto a se': fa gruppo da solo, cosi' non si confonde
    -- con l'offerta di cui la riga originale faceva parte.
    (r->>'id')::uuid,
    m.offerta_id,
    auth.uid(),
    -- Stesso morso a tenaglia di registra_movimenti: l'orologio del telefono
    -- non porta lo storno ne' nel futuro ne' prima dell'apertura.
    greatest(
      least((r->>'registrato_il')::timestamptz, now()),
      coalesce(v_aperta_il, '-infinity'::timestamptz)
    ),
    m.id
  from jsonb_array_elements(p_righe) r
  join public.movimenti m on m.id = (r->>'storna_id')::uuid
  -- Il reinvio della stessa busta di annullo non porta via il doppio.
  on conflict (id) do nothing;

  get diagnostics v_inserite = row_count;
  return v_inserite;
end;
$$;

revoke execute on function public.storna_movimenti(jsonb) from public, anon;
grant  execute on function public.storna_movimenti(jsonb) to authenticated;
