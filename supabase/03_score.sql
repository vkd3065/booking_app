-- 신용 점수 / 등급 제한 / 관리자 판정

-- 관리자인지 확인
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 관리자는 전체 조회 가능
drop policy if exists "관리자 전체 예약 조회" on public.reservations;
create policy "관리자 전체 예약 조회"
  on public.reservations for select
  to authenticated
  using (public.is_admin());

drop policy if exists "관리자 회원 조회" on public.profiles;
create policy "관리자 회원 조회"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- 점수 반영 (0~150 사이로 자름, 실제 반영된 값을 돌려줌)
-- 50점 아래로 떨어지면 14일 예약 제한
create or replace function public.apply_score(p_user uuid, p_delta int)
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
  return v_new - v_old;
end $$;

-- 예약 (등급 제한 포함)
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

  -- 내 점수 행을 잠그고 등급 확인 (동시에 여러 건 눌러도 순서대로 검사됨)
  select score, suspended_until into v_score, v_susp
  from public.profiles
  where id = v_uid
  for update;

  if v_susp is not null then
    if now() < v_susp then
      raise exception 'SUSPENDED';
    end if;
    -- 제한 기간이 끝나면 50점으로 복구
    update public.profiles set score = 50, suspended_until = null where id = v_uid;
    v_score := 50;
  end if;
  if v_score < 50 then
    raise exception 'SUSPENDED';
  end if;

  -- 등급: 120~ 우수 / 80~119 일반 / 50~79 주의
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
  return v_id;

exception
  when unique_violation then
    raise exception 'SLOT_TAKEN';          -- 이미 예약된 시간
end $$;

-- 취소 (등급별 마감 전 0점 / 마감 후 -15점)
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
    v_delta := public.apply_score(v_uid, -15);
    update public.reservations set status = 'canceled_late', score_delta = v_delta where id = p_id;
  end if;
end $$;

-- 관리자 판정: 방문 +5
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
  v_delta := public.apply_score(v_user, 5);
  update public.reservations set status = 'done', score_delta = v_delta where id = p_id;
end $$;

-- 관리자 판정: 노쇼 -30
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
  v_delta := public.apply_score(v_user, -30);
  update public.reservations set status = 'no_show', score_delta = v_delta where id = p_id;
end $$;

-- 판정 취소 (반영했던 점수를 그대로 되돌림)
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
  perform public.apply_score(v_user, -v_delta);
  update public.reservations set status = 'booked', score_delta = 0 where id = p_id;
end $$;

-- 권한
revoke all on function public.apply_score(uuid, int) from public, anon, authenticated;
revoke all on function public.mark_visit(bigint) from public, anon;
revoke all on function public.mark_no_show(bigint) from public, anon;
revoke all on function public.undo_decision(bigint) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.mark_visit(bigint) to authenticated;
grant execute on function public.mark_no_show(bigint) to authenticated;
grant execute on function public.undo_decision(bigint) to authenticated;
