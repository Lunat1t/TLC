-- Short-lived signaling metadata for direct WebRTC. No client may read the
-- backing tables, and the transport never sends media to the database.
create schema brick_display_private;
revoke all on schema brick_display_private from public;
grant usage on schema brick_display_private to anon, authenticated;

create table brick_display_private.sessions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null,
  offer_hash bytea not null unique,
  answer_hash bytea not null unique,
  offer jsonb,
  answer jsonb,
  expires_at timestamptz not null,
  deadline timestamptz not null
);
create index display_session_expiry_idx on brick_display_private.sessions (expires_at);
create index display_session_owner_idx on brick_display_private.sessions (owner_id, expires_at);

create table brick_display_private.create_limits (
  owner_id uuid primary key,
  window_start timestamptz not null,
  attempts integer not null
);
create index display_create_window_idx on brick_display_private.create_limits (window_start);

alter table brick_display_private.sessions enable row level security;
alter table brick_display_private.create_limits enable row level security;
revoke all on all tables in schema brick_display_private from public, anon, authenticated;

create function brick_display_private.signal(p_action text, p_token text, p_description jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := auth.uid();
  current_time_at timestamptz := pg_catalog.clock_timestamp();
  offer_token text;
  answer_token text;
  token_hash bytea;
  room brick_display_private.sessions%rowtype;
  caller_role text;
  existing_description jsonb;
  description jsonb;
  attempt_count integer;
begin
  if p_action = 'create' then
    if caller_id is null then
      return '{"status":401,"body":{"error":"Войдите в Brick Studio."}}'::jsonb;
    end if;

    -- Serializes rate and active-room checks for the same authenticated owner.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text, 61116));
    current_time_at := pg_catalog.clock_timestamp();
    if (select count(*) from brick_display_private.sessions
        where owner_id = caller_id and expires_at > current_time_at) >= 8 then
      return '{"status":429,"body":{"error":"Слишком много открытых сессий дисплея."}}'::jsonb;
    end if;
    insert into brick_display_private.create_limits as limits (owner_id, window_start, attempts)
      values (caller_id, current_time_at, 1)
      on conflict (owner_id) do update set
        attempts = case when limits.window_start <= current_time_at - interval '1 minute' then 1 else limits.attempts + 1 end,
        window_start = case when limits.window_start <= current_time_at - interval '1 minute' then current_time_at else limits.window_start end
      where limits.window_start <= current_time_at - interval '1 minute' or limits.attempts < 12
      returning attempts into attempt_count;
    if attempt_count is null then
      return '{"status":429,"body":{"error":"Подождите перед созданием нового QR-кода."}}'::jsonb;
    end if;

    delete from brick_display_private.sessions
      where id in (
        select id from brick_display_private.sessions where expires_at <= current_time_at
        order by expires_at limit 64 for update skip locked
      );
    delete from brick_display_private.create_limits
      where owner_id in (
        select owner_id from brick_display_private.create_limits where window_start <= current_time_at - interval '1 day'
        order by window_start limit 64 for update skip locked
      );

    -- Two PostgreSQL-generated version 4 UUIDs per bearer token.
    offer_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text || pg_catalog.gen_random_uuid()::text, '-', '');
    answer_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text || pg_catalog.gen_random_uuid()::text, '-', '');
    insert into brick_display_private.sessions (owner_id, offer_hash, answer_hash, expires_at, deadline)
      values (
        caller_id,
        pg_catalog.sha256(pg_catalog.convert_to(offer_token, 'UTF8')),
        pg_catalog.sha256(pg_catalog.convert_to(answer_token, 'UTF8')),
        current_time_at + interval '5 minutes',
        current_time_at + interval '4 hours'
      );
    return pg_catalog.jsonb_build_object('status', 200, 'body',
      pg_catalog.jsonb_build_object('offerToken', offer_token, 'answerToken', answer_token));
  end if;

  if p_action is null or p_action not in ('read', 'publish', 'close') then
    return '{"status":400,"body":{"error":"Неизвестное действие."}}'::jsonb;
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return '{"status":400,"body":{"error":"Неверный код подключения."}}'::jsonb;
  end if;

  token_hash := pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));
  if p_action = 'read' then
    select * into room from brick_display_private.sessions
      where expires_at > current_time_at and (offer_hash = token_hash or answer_hash = token_hash);
  else
    select * into room from brick_display_private.sessions
      where expires_at > current_time_at and (offer_hash = token_hash or answer_hash = token_hash)
      for update;
    current_time_at := pg_catalog.clock_timestamp();
  end if;

  if room.id is null or room.expires_at <= current_time_at
    or (room.offer_hash = token_hash and room.owner_id is distinct from caller_id) then
    return '{"status":404,"body":{"error":"Сессия дисплея закрыта."}}'::jsonb;
  end if;
  caller_role := case when room.offer_hash = token_hash then 'offer' else 'answer' end;

  if p_action = 'close' then
    delete from brick_display_private.sessions where id = room.id;
    return '{"status":200,"body":{"ok":true}}'::jsonb;
  end if;

  if p_action = 'read' then
    -- Waiting QR codes keep their original expiry. Active leases are renewed
    -- only near expiry, so periodic reads usually need no row write.
    if room.answer is not null and room.expires_at < room.deadline
      and room.expires_at <= current_time_at + interval '30 seconds' then
      update brick_display_private.sessions
        set expires_at = least(deadline, current_time_at + interval '90 seconds')
        where id = room.id and expires_at > current_time_at
          and expires_at <= current_time_at + interval '30 seconds';
    end if;
    return pg_catalog.jsonb_build_object('status', 200, 'body',
      pg_catalog.jsonb_build_object('description', case when caller_role = 'offer' then room.answer else room.offer end));
  end if;

  if pg_catalog.jsonb_typeof(p_description) is distinct from 'object'
    or p_description->>'type' is distinct from caller_role
    or pg_catalog.jsonb_typeof(p_description->'sdp') is distinct from 'string'
    or pg_catalog.btrim(p_description->>'sdp') = ''
    or pg_catalog.octet_length(p_description->>'sdp') > 32768 then
    return '{"status":400,"body":{"error":"Неверные параметры видеосвязи."}}'::jsonb;
  end if;
  if caller_role = 'answer' and room.offer is null then
    return '{"status":409,"body":{"error":"Дисплей ещё не готов."}}'::jsonb;
  end if;

  description := pg_catalog.jsonb_build_object('type', caller_role, 'sdp', p_description->>'sdp');
  existing_description := case when caller_role = 'offer' then room.offer else room.answer end;
  if existing_description is not null then
    if existing_description <> description then
      return '{"status":409,"body":{"error":"Код подключения уже использован."}}'::jsonb;
    end if;
  elsif caller_role = 'offer' then
    update brick_display_private.sessions set offer = description where id = room.id;
  else
    update brick_display_private.sessions
      set answer = description, expires_at = least(deadline, current_time_at + interval '90 seconds')
      where id = room.id;
  end if;

  return '{"status":200,"body":{"ok":true}}'::jsonb;
end;
$function$;

revoke all on function brick_display_private.signal(text, text, jsonb) from public, anon, authenticated;
grant execute on function brick_display_private.signal(text, text, jsonb) to anon, authenticated;

create function public.display_signal(p_action text, p_token text default null, p_description jsonb default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select brick_display_private.signal(p_action, p_token, p_description);
$function$;

revoke all on function public.display_signal(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.display_signal(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
