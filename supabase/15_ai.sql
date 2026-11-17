-- AI 연동 자동 관리 (A5)
-- AI에는 아래 조회 함수의 결과만 전달함. 예약, 점수, 판정을 바꾸는 함수는 연결하지 않음

-- AI에 이름 대신 넘길 회원 번호
alter table public.profiles add column if not exists member_no bigint generated always as identity;

-- 하루 호출 횟수 기록
create table if not exists public.ai_calls (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_calls enable row level security; -- 정책 없음: 함수로만 접근

-- 호출 1회 사용. 하루 한도를 넘으면 오류
create or replace function public.ai_use(p_limit int default 20)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'LOGIN_REQUIRED';
  end if;
  insert into public.ai_calls (user_id, day, count)
  values (v_uid, (now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (user_id, day) do update set count = public.ai_calls.count + 1
  returning count into v_count;
  if v_count > p_limit then
    raise exception 'AI_LIMIT';
  end if;
  return v_count;
end $$;

-- 기간 안의 예약된 시간 (누가 예약했는지는 주지 않음)
create or replace function public.taken_between(p_from timestamptz, p_to timestamptz)
returns table (resource_id bigint, slot timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.resource_id, r.slot
  from public.reservations r
  where r.status = 'booked' and r.slot >= p_from and r.slot < p_to;
$$;

-- 회원별 이용 기록 (관리자용, 이름 없이 회원 번호만)
create or replace function public.ai_member_records(p_days int default 30)
returns table (member_no bigint, score int, visits bigint, no_shows bigint, late_cancels bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select p.member_no, p.score,
           count(*) filter (where r.status = 'done'),
           count(*) filter (where r.status = 'no_show'),
           count(*) filter (where r.status = 'canceled_late')
    from public.profiles p
    left join public.reservations r
      on r.user_id = p.id and r.slot >= now() - make_interval(days => p_days)
    group by p.member_no, p.score
    order by p.member_no;
end $$;

revoke all on function public.ai_use(int) from public, anon;
revoke all on function public.taken_between(timestamptz, timestamptz) from public, anon;
revoke all on function public.ai_member_records(int) from public, anon;
grant execute on function public.ai_use(int) to authenticated;
grant execute on function public.taken_between(timestamptz, timestamptz) to authenticated;
grant execute on function public.ai_member_records(int) to authenticated;
