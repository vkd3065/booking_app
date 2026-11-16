-- 대기 신청 (A4)
-- 예약된 시간에 대기를 걸어 두면, 취소가 나왔을 때 신용 점수가 높은 순으로 자동 예약

create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id bigint not null references public.resources(id),
  slot timestamptz not null,
  status text not null default 'waiting' check (status in ('waiting', 'assigned', 'canceled')),
  created_at timestamptz not null default now()
);

-- 같은 시간에 대기는 한 번만
create unique index if not exists uniq_waiting
  on public.waitlist (user_id, resource_id, slot) where status = 'waiting';
create index if not exists waitlist_slot on public.waitlist (resource_id, slot) where status = 'waiting';

alter table public.waitlist enable row level security;

drop policy if exists "내 대기 신청 조회" on public.waitlist;
create policy "내 대기 신청 조회"
  on public.waitlist for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.waitlist to authenticated;

-- 대기 신청
create or replace function public.join_waitlist(p_resource_id bigint, p_slot timestamptz)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_score int;
  v_owner uuid;
  v_id    bigint;
begin
  if v_uid is null then
    raise exception 'LOGIN_REQUIRED';
  end if;
  if p_slot <= now() then
    raise exception 'PAST_SLOT';
  end if;

  select score into v_score from public.profiles where id = v_uid;
  if v_score < 50 then
    raise exception 'SUSPENDED';
  end if;

  -- 예약된 시간에만 대기를 걸 수 있음
  select user_id into v_owner
  from public.reservations
  where resource_id = p_resource_id and slot = p_slot and status = 'booked';
  if not found then
    raise exception 'NOT_TAKEN';
  end if;
  if v_owner = v_uid then
    raise exception 'ALREADY_MINE';
  end if;

  -- 동시에 걸 수 있는 대기는 3건까지
  if (select count(*) from public.waitlist
      where user_id = v_uid and status = 'waiting' and slot > now()) >= 3 then
    raise exception 'WAIT_LIMIT';
  end if;

  insert into public.waitlist (user_id, resource_id, slot)
  values (v_uid, p_resource_id, p_slot)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'ALREADY_WAITING';
end $$;

-- 대기 취소
create or replace function public.leave_waitlist(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.waitlist set status = 'canceled'
  where id = p_id and user_id = auth.uid() and status = 'waiting';
  if not found then
    raise exception 'CANNOT_CANCEL';
  end if;
end $$;

-- 자리가 났을 때: 대기자 중 점수 높은 순(같으면 먼저 신청한 순)으로 예약을 넣음
-- 등급 조건(기간, 동시 예약 수, 인기 시간대)에 안 맞는 대기자는 건너뜀
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
    order by p.score desc, wl.created_at
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

revoke all on function public.assign_waiter(bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.join_waitlist(bigint, timestamptz) from public, anon;
revoke all on function public.leave_waitlist(bigint) from public, anon;
grant execute on function public.join_waitlist(bigint, timestamptz) to authenticated;
grant execute on function public.leave_waitlist(bigint) to authenticated;

-- 예약 취소 (08과 같고, 취소 뒤 대기자 배정만 추가)
create or replace function public.cancel_booking(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  timestamptz;
  v_res   bigint;
  v_score int;
  v_hours int;
  v_delta int;
begin
  select slot, resource_id into v_slot, v_res
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

  -- 자리가 났으니 대기자에게 배정
  perform public.assign_waiter(v_res, v_slot);
end $$;

