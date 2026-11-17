-- 예약 대상 관리 (A8)
-- 관리자가 예약 대상을 추가, 수정하고 예약을 받지 않게 숨길 수 있음

alter table public.resources drop constraint if exists resources_hours_check;
alter table public.resources
  add constraint resources_hours_check check (open_hour >= 0 and close_hour <= 24 and open_hour < close_hour);

-- 관리자는 숨긴 대상도 조회
drop policy if exists "관리자는 숨긴 자원도 조회" on public.resources;
create policy "관리자는 숨긴 자원도 조회"
  on public.resources for select
  to authenticated
  using (public.is_admin());

-- 추가(p_id가 null) 또는 수정
create or replace function public.save_resource(p_id bigint, p_name text, p_open int, p_close int)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'BAD_NAME';
  end if;
  if p_open < 0 or p_close > 24 or p_open >= p_close then
    raise exception 'BAD_HOURS';
  end if;

  if p_id is null then
    insert into public.resources (name, open_hour, close_hour)
    values (trim(p_name), p_open, p_close)
    returning id into v_id;
    return v_id;
  end if;

  -- 운영 시간을 줄일 때, 줄어든 시간에 잡힌 예약이 있으면 막음
  if exists (
    select 1 from public.reservations
    where resource_id = p_id and status = 'booked' and slot > now()
      and (extract(hour from slot at time zone 'Asia/Seoul') < p_open
        or extract(hour from slot at time zone 'Asia/Seoul') >= p_close)
  ) then
    raise exception 'HAS_RESERVATIONS';
  end if;

  update public.resources
  set name = trim(p_name), open_hour = p_open, close_hour = p_close
  where id = p_id;
  return p_id;
end $$;

-- 예약 받기 / 숨기기
create or replace function public.set_resource_active(p_id bigint, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  -- 남은 예약이 있으면 숨길 수 없음
  if not p_active and exists (
    select 1 from public.reservations
    where resource_id = p_id and status = 'booked' and slot > now()
  ) then
    raise exception 'HAS_RESERVATIONS';
  end if;
  update public.resources set active = p_active where id = p_id;
end $$;

revoke all on function public.save_resource(bigint, text, int, int) from public, anon;
revoke all on function public.set_resource_active(bigint, boolean) from public, anon;
grant execute on function public.save_resource(bigint, text, int, int) to authenticated;
grant execute on function public.set_resource_active(bigint, boolean) to authenticated;
