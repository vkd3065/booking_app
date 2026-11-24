-- 여러 매장 1단계: 매장 표를 만들고 지금 데이터를 '기본 매장'으로 연결
-- 예약 대상이 매장에 속함 (예약, 대기, 인기 시간대는 예약 대상을 통해 매장이 정해짐)
-- 업종은 3단계에서 고르게 할 예정이라 지금은 '기타'

create table if not exists public.stores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 1 and 40),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,30}$'), -- 매장 주소에 쓸 이름
  category text not null default 'etc',
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;

drop policy if exists "매장은 로그인하면 조회" on public.stores;
create policy "매장은 로그인하면 조회"
  on public.stores for select
  to authenticated
  using (true);

-- 기본 매장: 지금 관리자가 주인
insert into public.stores (name, slug, owner_id)
select '기본 매장', 'main', id from public.profiles where is_admin order by created_at limit 1
on conflict (slug) do nothing;

alter table public.resources add column if not exists store_id bigint references public.stores(id);
update public.resources set store_id = (select id from public.stores where slug = 'main') where store_id is null;
alter table public.resources alter column store_id set not null;

-- 새 예약 대상도 기본 매장에 넣음 (2단계에서 관리자 본인 매장으로 바꿀 예정)
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
    insert into public.resources (store_id, name, open_hour, close_hour)
    values ((select id from public.stores where slug = 'main'), trim(p_name), p_open, p_close)
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
