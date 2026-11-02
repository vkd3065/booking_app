-- 인기 시간대 (관리자가 지정, 주의 등급은 예약 불가)

-- 요일(0=일 ~ 6=토), 시각(한국 시간)
create table if not exists public.peak_hours (
  resource_id bigint not null references public.resources(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  hour smallint not null check (hour between 0 and 23),
  primary key (resource_id, weekday, hour)
);

alter table public.peak_hours enable row level security;

drop policy if exists "인기 시간대는 누구나 조회" on public.peak_hours;
create policy "인기 시간대는 누구나 조회"
  on public.peak_hours for select
  to authenticated
  using (true);

drop policy if exists "관리자만 인기 시간대 추가" on public.peak_hours;
create policy "관리자만 인기 시간대 추가"
  on public.peak_hours for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "관리자만 인기 시간대 삭제" on public.peak_hours;
create policy "관리자만 인기 시간대 삭제"
  on public.peak_hours for delete
  to authenticated
  using (public.is_admin());

grant select, insert, delete on public.peak_hours to authenticated;

-- 이 시간이 인기 시간대인지
create or replace function public.is_peak(p_resource_id bigint, p_slot timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.peak_hours
    where resource_id = p_resource_id
      and weekday = extract(dow from p_slot at time zone 'Asia/Seoul')
      and hour = extract(hour from p_slot at time zone 'Asia/Seoul')
  );
$$;

-- 예약 (04의 book_slot에 인기 시간대 검사 추가)
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
