-- 점수 자동 회복 / 제한 자동 해제 (pg_cron)
-- Supabase: Database > Extensions 에서 pg_cron 켜고 실행

-- 매월 회복: 100점 미만 회원 +5 (100점까지)
create or replace function public.monthly_recover()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id, score from public.profiles where score < 100 loop
    perform public.apply_score(r.id, least(5, 100 - r.score));
    n := n + 1;
  end loop;
  return n;
end $$;

-- 제한 해제: 14일 지난 회원은 50점으로
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
    perform public.apply_score(r.id, 50 - r.score);
    n := n + 1;
  end loop;
  return n;
end $$;

-- 회원이 직접 부를 수 없게
revoke all on function public.monthly_recover() from public, anon, authenticated;
revoke all on function public.release_suspended() from public, anon, authenticated;

-- 일정 등록 (UTC 기준)
-- 매월 1일 0시 UTC = 한국 시간 오전 9시, 제한 해제는 매시 10분
create extension if not exists pg_cron;

select cron.unschedule(jobname) from cron.job
where jobname in ('monthly-recover', 'release-suspended');

select cron.schedule('monthly-recover', '0 0 1 * *', 'select public.monthly_recover()');
select cron.schedule('release-suspended', '10 * * * *', 'select public.release_suspended()');
