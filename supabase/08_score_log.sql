-- 점수 변동 내역 (A1)
-- 점수가 바뀔 때마다 이유와 함께 기록

create table if not exists public.score_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,                       -- 바뀐 점수
  score_after int not null,                 -- 바뀐 뒤 점수
  reason text not null,                     -- 방문, 노쇼, 늦은 취소 등
  reservation_id bigint references public.reservations(id),
  created_at timestamptz not null default now()
);

create index if not exists score_logs_user on public.score_logs (user_id, created_at desc);

alter table public.score_logs enable row level security;

drop policy if exists "내 점수 내역 조회" on public.score_logs;
create policy "내 점수 내역 조회"
  on public.score_logs for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.score_logs to authenticated;

-- 점수 반영 + 내역 기록 (이유, 관련 예약을 같이 받음)
drop function if exists public.apply_score(uuid, int);
create or replace function public.apply_score(
  p_user uuid, p_delta int, p_reason text default '기타', p_res bigint default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_old int;
  v_new int;
begin
  select score into v_old from public.profiles where id = p_user for update;
  v_new := greatest(0, least(150, v_old + p_delta));
  update public.profiles
  set score = v_new,
      suspended_until = case
        when v_new < 50 and v_old >= 50 then now() + interval '14 days'
        when v_new >= 50 then null
        else suspended_until
      end
  where id = p_user;
  if v_new <> v_old then
    insert into public.score_logs (user_id, delta, score_after, reason, reservation_id)
    values (p_user, v_new - v_old, v_new, p_reason, p_res);
  end if;
  return v_new - v_old;
end $$;

revoke all on function public.apply_score(uuid, int, text, bigint) from public, anon, authenticated;

-- 아래는 기존 함수에 내역 이유만 추가

create or replace function public.cancel_booking(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  timestamptz;
  v_score int;
  v_hours int;
  v_delta int;
begin
  select slot into v_slot
  from public.reservations
  where id = p_id and user_id = v_uid and status = 'booked' and slot > now()
  for update;
  if not found then
    raise exception 'CANNOT_CANCEL';
  end if;

  -- 취소 마감: 우수 2시간 전 / 일반 24시간 전 / 주의 48시간 전
  select score into v_score from public.profiles where id = v_uid;
  v_hours := case when v_score >= 120 then 2 when v_score >= 80 then 24 else 48 end;

  if now() <= v_slot - make_interval(hours => v_hours) then
    update public.reservations set status = 'canceled' where id = p_id;
  else
    v_delta := public.apply_score(v_uid, -15, '늦은 취소', p_id);
    update public.reservations set status = 'canceled_late', score_delta = v_delta where id = p_id;
  end if;
end $$;

create or replace function public.mark_visit(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user  uuid;
  v_delta int;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  select user_id into v_user
  from public.reservations
  where id = p_id and status = 'booked' and slot <= now()
  for update;
  if not found then
    raise exception 'CANNOT_DECIDE';
  end if;
  v_delta := public.apply_score(v_user, 5, '방문', p_id);
  update public.reservations set status = 'done', score_delta = v_delta where id = p_id;
end $$;

create or replace function public.mark_no_show(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user  uuid;
  v_delta int;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  select user_id into v_user
  from public.reservations
  where id = p_id and status = 'booked' and slot <= now()
  for update;
  if not found then
    raise exception 'CANNOT_DECIDE';
  end if;
  v_delta := public.apply_score(v_user, -30, '노쇼', p_id);
  update public.reservations set status = 'no_show', score_delta = v_delta where id = p_id;
end $$;

create or replace function public.undo_decision(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user  uuid;
  v_delta int;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  select user_id, score_delta into v_user, v_delta
  from public.reservations
  where id = p_id and status in ('done', 'no_show')
  for update;
  if not found then
    raise exception 'CANNOT_UNDO';
  end if;
  perform public.apply_score(v_user, -v_delta, '판정 취소', p_id);
  update public.reservations set status = 'booked', score_delta = 0 where id = p_id;
end $$;

create or replace function public.monthly_recover()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id, score from public.profiles where score < 100 loop
    perform public.apply_score(r.id, least(5, 100 - r.score), '매월 회복');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.release_suspended()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, score from public.profiles
    where suspended_until is not null and suspended_until <= now()
  loop
    perform public.apply_score(r.id, 50 - r.score, '제한 해제');
    n := n + 1;
  end loop;
  return n;
end $$;

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
    perform public.apply_score(v_uid, 50 - v_score, '제한 해제');
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

  -- 주의 등급은 인기 시간대 불가
  if v_score < 80 and public.is_peak(p_resource_id, p_slot) then
    raise exception 'PEAK_LIMIT';
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
