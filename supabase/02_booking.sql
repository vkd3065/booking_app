-- 예약 / 취소 / 예약된 시간 조회

-- score_delta 없으면 추가
alter table public.reservations add column if not exists score_delta int not null default 0;

-- 내 예약만 조회
drop policy if exists "내 예약만 조회" on public.reservations;
create policy "내 예약만 조회"
  on public.reservations for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 예약된 시간 조회 (예약자 정보는 안 보냄)
create or replace function public.get_taken_slots(p_resource_id bigint, p_day date)
returns setof timestamptz
language sql stable security definer set search_path = ''
as $$
  select r.slot
  from public.reservations r
  where r.resource_id = p_resource_id
    and r.status = 'booked'
    and r.slot >= (p_day::timestamp at time zone 'Asia/Seoul')
    and r.slot <  ((p_day + 1)::timestamp at time zone 'Asia/Seoul');
$$;

-- 예약
create or replace function public.book_slot(p_resource_id bigint, p_slot timestamptz)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_open int;
  v_close int;
  v_hour int;
  v_id   bigint;
begin
  if v_uid is null then
    raise exception 'LOGIN_REQUIRED';
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
  return v_id;

exception
  when unique_violation then
    raise exception 'SLOT_TAKEN';          -- 이미 예약된 시간
end $$;

-- 취소
create or replace function public.cancel_booking(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.reservations
  set status = 'canceled'
  where id = p_id
    and user_id = auth.uid()
    and status = 'booked'
    and slot > now();
  if not found then
    raise exception 'CANNOT_CANCEL';
  end if;
end $$;

-- 권한
revoke all on function public.book_slot(bigint, timestamptz) from public, anon;
revoke all on function public.cancel_booking(bigint) from public, anon;
grant execute on function public.book_slot(bigint, timestamptz) to authenticated;
grant execute on function public.cancel_booking(bigint) to authenticated;
grant execute on function public.get_taken_slots(bigint, date) to anon, authenticated;
