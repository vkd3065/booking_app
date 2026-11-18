-- 코드 검토에서 나온 규칙 보완 (11/18)
-- 1. 매월 회복: 예약 제한 중인 회원은 제외 (+5점으로 50점을 넘어 14일 전에 제한이 풀리던 문제)
-- 2. 결제: 이용 시간(1시간) 안에만 가능 (오지 않고 나중에 결제해서 노쇼 감점을 피하던 문제)
-- 3. 노쇼 판정: 예약 시각 15분이 지난 뒤에만 가능 (화면에서만 막고 있던 것을 DB에서도 막음)
-- 4. 판정 취소: 결제로 방문 처리된 예약은 취소 불가 (취소하면 다시 결제할 수 없던 문제)
-- 5. 이의신청 결정: 실제로 복구한 점수를 돌려주고 알림에도 그대로 씀 (판정이 취소된 예약이면 0점)

create or replace function public.monthly_recover()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  -- 제한 중인 회원은 제한이 끝날 때 50점으로 돌아가므로 제외
  for r in select id, score from public.profiles where score < 100 and suspended_until is null loop
    perform public.apply_score(r.id, least(5, 100 - r.score), '매월 회복');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.pay_reservation(p_id bigint)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_res    bigint;
  v_slot   timestamptz;
  v_amount int;
  v_delta  int;
begin
  -- 예약 행을 잠가서 관리자 판정과 동시에 처리되지 않게 함
  select resource_id, slot into v_res, v_slot
  from public.reservations
  where id = p_id and user_id = v_uid and status = 'booked'
  for update;
  if not found then
    raise exception 'CANNOT_PAY';
  end if;
  if v_slot > now() then
    raise exception 'TOO_EARLY';
  end if;
  -- 이용 시간이 끝나면 결제할 수 없음 (방문 여부는 관리자가 판정)
  if now() >= v_slot + interval '1 hour' then
    raise exception 'PAY_CLOSED';
  end if;

  select price into v_amount from public.resources where id = v_res;
  insert into public.payments (reservation_id, user_id, amount)
  values (p_id, v_uid, v_amount);

  -- 결제 기록이 있으면 방문으로 자동 처리
  v_delta := public.apply_score(v_uid, 5, '방문 (결제)', p_id);
  update public.reservations set status = 'done', score_delta = v_delta where id = p_id;
  return v_amount;
exception
  when unique_violation then
    raise exception 'ALREADY_PAID';
end $$;

create or replace function public.mark_no_show(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user  uuid;
  v_slot  timestamptz;
  v_delta int;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  select user_id, slot into v_user, v_slot
  from public.reservations
  where id = p_id and status = 'booked' and slot <= now()
  for update;
  if not found then
    raise exception 'CANNOT_DECIDE';
  end if;
  -- 노쇼 기준: 예약 시각 15분 경과까지 미방문
  if now() < v_slot + interval '15 minutes' then
    raise exception 'NO_SHOW_TOO_EARLY';
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
  -- 결제 기록이 방문의 근거라서 되돌리지 않음
  if exists (select 1 from public.payments where reservation_id = p_id) then
    raise exception 'PAID_VISIT';
  end if;
  perform public.apply_score(v_user, -v_delta, '판정 취소', p_id);
  update public.reservations set status = 'booked', score_delta = 0 where id = p_id;
end $$;

-- 돌려주는 값이 바뀌어서(복구한 점수) 지우고 다시 만듦
drop function if exists public.decide_appeal(bigint, boolean, text);
create function public.decide_appeal(p_id bigint, p_accept boolean, p_note text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_res    bigint;
  v_user   uuid;
  v_slot   timestamptz;
  v_status text;
  v_delta  int;
  v_back   int := 0; -- 실제로 복구한 점수
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  -- 같은 신청을 두 번 처리하지 않게 잠금
  select reservation_id, user_id into v_res, v_user
  from public.appeals
  where id = p_id and status = 'pending'
  for update;
  if not found then
    raise exception 'ALREADY_DECIDED';
  end if;

  select slot, status, score_delta into v_slot, v_status, v_delta
  from public.reservations
  where id = v_res
  for update;

  -- 노쇼 판정이 그대로일 때만 점수를 되돌림 (판정이 이미 취소된 예약은 점수 변동 없음)
  if p_accept and v_status = 'no_show' then
    v_back := public.apply_score(v_user, -v_delta, '이의신청 수락', v_res);
    update public.reservations set status = 'excused', score_delta = 0 where id = v_res;
  end if;

  update public.appeals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      admin_note = nullif(trim(coalesce(p_note, '')), ''),
      decided_at = now()
  where id = p_id;

  insert into public.notices (user_id, reservation_id, kind, body)
  values (v_user, v_res, 'appeal',
          public.kst_label(v_slot) || ' 노쇼 이의신청이 '
          || case
               when not p_accept then '거절되었습니다.'
               when v_back > 0 then '수락되어 ' || v_back || '점이 복구되었습니다.'
               else '수락되었습니다.'
             end
          || coalesce(' (' || nullif(trim(coalesce(p_note, '')), '') || ')', ''))
  on conflict (reservation_id, kind) do nothing;
  return v_back;
end $$;

revoke all on function public.decide_appeal(bigint, boolean, text) from public, anon;
grant execute on function public.decide_appeal(bigint, boolean, text) to authenticated;
