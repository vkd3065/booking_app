-- 예약 시스템 테이블

-- 회원
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  score int not null default 100,          -- 신용점수
  is_admin boolean not null default false,
  suspended_until timestamptz,             -- 예약 제한 풀리는 시간
  created_at timestamptz not null default now()
);

-- 예약 대상
create table resources (
  id bigint generated always as identity primary key,
  name text not null,
  open_hour int not null default 10,       -- 운영 시작
  close_hour int not null default 20,      -- 운영 종료
  active boolean not null default true
);

-- 예약
create table reservations (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  resource_id bigint not null references resources(id),
  slot timestamptz not null,               -- 예약 시간 (1시간 단위)
  status text not null default 'booked'
    check (status in ('booked','done','no_show','canceled','canceled_late')),
  score_delta int not null default 0,      -- 반영된 점수
  created_at timestamptz not null default now()
);

-- 같은 자원, 같은 시간에 booked는 1개만
create unique index uniq_active_slot
  on reservations (resource_id, slot)
  where status = 'booked';

-- RLS
alter table profiles enable row level security;
alter table resources enable row level security;
alter table reservations enable row level security;

create policy "자원은 누구나 조회"
  on public.resources for select
  to anon, authenticated
  using (active);

create policy "내 프로필만 조회"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- 회원가입 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 테스트용 자원
insert into resources (name) values ('자원 A'), ('자원 B'), ('자원 C');
