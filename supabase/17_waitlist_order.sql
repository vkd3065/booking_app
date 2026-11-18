-- 대기 배정 순서 보완
-- 테스트 중 발견: 같은 트랜잭션 안에서 대기 신청이 들어오면 신청 시각(now())이 같아져 배정 순서가 정해지지 않음
-- 점수가 같고 신청 시각도 같으면 신청 번호(id) 순으로 배정

create or replace function public.assign_waiter(p_resource_id bigint, p_slot timestamptz)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  w       record;
  v_score int;
  v_days  int;
  v_max   int;
  v_count int;
begin
  if p_slot <= now() then
    return null;
  end if;

  for w in
    select wl.id, wl.user_id
    from public.waitlist wl
    join public.profiles p on p.id = wl.user_id
    where wl.resource_id = p_resource_id and wl.slot = p_slot and wl.status = 'waiting'
    order by p.score desc, wl.created_at, wl.id
  loop
    -- 대기자 점수 행을 잠그고 지금 등급으로 다시 확인
    select score into v_score from public.profiles where id = w.user_id for update;
    v_days := case when v_score >= 120 then 30 when v_score >= 80 then 14 else 7 end;
    v_max  := case when v_score >= 120 then 3 when v_score >= 80 then 2 else 1 end;
    select count(*) into v_count
    from public.reservations
    where user_id = w.user_id and status = 'booked' and slot > now();

    continue when v_score < 50;
    continue when p_slot > now() + make_interval(days => v_days);
    continue when v_count >= v_max;
    continue when v_score < 80 and public.is_peak(p_resource_id, p_slot);

    insert into public.reservations (user_id, resource_id, slot)
    values (w.user_id, p_resource_id, p_slot);
    update public.waitlist set status = 'assigned' where id = w.id;
    return w.user_id;
  end loop;
  return null;
end $$;
