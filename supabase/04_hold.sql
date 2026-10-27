-- 예약 대기 (확인 창이 떠 있는 동안 누른 순서 기억)

create table if not exists public.slot_holds (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id bigint not null references public.resources(id),
  slot timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);
create index if not exists slot_holds_slot on public.slot_holds (resource_id, slot, created_at);

-- 직접 접근 금지 (함수로만)
alter table public.slot_holds enable row level security;

-- 내 앞에 대기 중인 사람 수
create or replace function public.hold_position(p_resource_id bigint, p_slot timestamptz)
returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
  from public.slot_holds o
  where o.resource_id = p_resource_id
    and o.slot = p_slot
    and o.user_id <> auth.uid()
    and o.expires_at > now()
    and o.created_at < coalesce(
      (select min(m.created_at) from public.slot_holds m
       where m.resource_id = p_resource_id and m.slot = p_slot
         and m.user_id = auth.uid() and m.expires_at > now()),
      'infinity'::timestamptz);
$$;

-- 시간 칸을 눌렀을 때: 대기 등록 (60초)
create or replace function public.hold_slot(p_resource_id bigint, p_slot timestamptz)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'LOGIN_REQUIRED';
  end if;
  if p_slot <= now() then
    raise exception 'PAST_SLOT';
  end if;
  if exists (select 1 from public.reservations
             where resource_id = p_resource_id and slot = p_slot and status = 'booked') then
    raise exception 'SLOT_TAKEN';
  end if;

  -- 지난 대기 정리, 내 다른 대기는 하나만 남김
  delete from public.slot_holds where expires_at <= now() or user_id = v_uid;

  insert into public.slot_holds (user_id, resource_id, slot, expires_at)
  values (v_uid, p_resource_id, p_slot, now() + interval '60 seconds');

  return public.hold_position(p_resource_id, p_slot);
end $$;

-- 취소를 눌렀을 때: 대기 해제
create or replace function public.release_hold(p_resource_id bigint, p_slot timestamptz)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.slot_holds
  where user_id = auth.uid() and resource_id = p_resource_id and slot = p_slot;
$$;

-- 확인을 눌렀을 때: 예약 (앞에 대기 중인 사람이 있으면 WAIT_TURN)
create or replace function public.book_slot(p_resource_id bigint, p_slot timestamptz)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_score int;
  v_susp  timestamptz;
  v_days  int;
  v_max   int;
  v_count int;
  v_open  int;
  v_close int;
  v_hour  int;
  v_id    bigint;
begin
  if v_uid is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  -- 같은 시간 대기 줄을 잠가서 확인 순서를 한 줄로 세움
  perform 1 from public.slot_holds
  where resource_id = p_resource_id and slot = p_slot
  for update;

  if public.hold_position(p_resource_id, p_slot) > 0 then
    raise exception 'WAIT_TURN';
  end if;

  select score, suspended_until into v_score, v_susp
  from public.profiles
  where id = v_uid
  for update;

  if v_susp is not null then
    if now() < v_susp then
      raise exception 'SUSPENDED';
    end if;
    update public.profiles set score = 50, suspended_until = null where id = v_uid;
    v_score := 50;
  end if;
  if v_score < 50 then
    raise exception 'SUSPENDED';
  end if;

  v_days := case when v_score >= 120 then 30 when v_score >= 80 then 14 else 7 end;
  v_max  := case when v_score >= 120 then 3  when v_score >= 80 then 2  else 1 end;

  if p_slot > now() + make_interval(days => v_days) then
    raise exception 'TOO_FAR';
  end if;

  select count(*) into v_count
  from public.reservations
  where user_id = v_uid and status = 'booked' and slot > now();
  if v_count >= v_max then
    raise exception 'LIMIT_RESERVATIONS';
  end if;

  select open_hour, close_hour into v_open, v_close
  from public.resources
  where id = p_resource_id and active;
  if not found then
    raise exception 'NO_RESOURCE';
  end if;

  if p_slot <= now() then
    raise exception 'PAST_SLOT';
  end if;
  if date_trunc('hour', p_slot) <> p_slot then
    raise exception 'BAD_SLOT';
  end if;
  v_hour := extract(hour from p_slot at time zone 'Asia/Seoul');
  if v_hour < v_open or v_hour >= v_close then
    raise exception 'CLOSED_HOUR';
  end if;

  insert into public.reservations (user_id, resource_id, slot)
  values (v_uid, p_resource_id, p_slot)
  returning id into v_id;

  -- 이 시간 대기는 전부 정리 (뒷사람은 SLOT_TAKEN 안내를 받음)
  delete from public.slot_holds where resource_id = p_resource_id and slot = p_slot;
  return v_id;

exception
  when unique_violation then
    raise exception 'SLOT_TAKEN';          -- 이미 예약된 시간
end $$;

-- 권한
revoke all on function public.hold_slot(bigint, timestamptz) from public, anon;
revoke all on function public.release_hold(bigint, timestamptz) from public, anon;
revoke all on function public.hold_position(bigint, timestamptz) from public, anon;
grant execute on function public.hold_slot(bigint, timestamptz) to authenticated;
grant execute on function public.release_hold(bigint, timestamptz) to authenticated;
grant execute on function public.hold_position(bigint, timestamptz) to authenticated;
