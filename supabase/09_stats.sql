-- 관리자 통계 (A3)
-- 최근 p_days일 동안 시작 시각이 지난 예약 기준 (0이면 전체 기간)

create or replace function public.admin_stats(p_days int)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_from timestamptz;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  v_from := case when p_days > 0 then now() - make_interval(days => p_days) else '-infinity' end;

  with r as (
    select status, slot at time zone 'Asia/Seoul' as kst
    from public.reservations
    where slot >= v_from and slot <= now()
  )
  select jsonb_build_object(
    -- 상태별 건수
    'total',     (select count(*) from r),
    'done',      (select count(*) from r where status = 'done'),
    'no_show',   (select count(*) from r where status = 'no_show'),
    'canceled',  (select count(*) from r where status = 'canceled'),
    'late',      (select count(*) from r where status = 'canceled_late'),
    'pending',   (select count(*) from r where status = 'booked'),
    -- 시간대별: 예약 수, 노쇼 수 (취소 제외)
    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h, 'count', c, 'no_show', n) order by h)
      from (
        select extract(hour from kst)::int h, count(*) c, count(*) filter (where status = 'no_show') n
        from r where status not in ('canceled', 'canceled_late')
        group by 1
      ) x
    ), '[]'),
    -- 요일별 (0=일 ~ 6=토)
    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', w, 'count', c, 'no_show', n) order by w)
      from (
        select extract(dow from kst)::int w, count(*) c, count(*) filter (where status = 'no_show') n
        from r where status not in ('canceled', 'canceled_late')
        group by 1
      ) x
    ), '[]'),
    -- 등급별 회원 수 (현재)
    'grades', (
      select jsonb_build_object(
        '우수', count(*) filter (where score >= 120),
        '일반', count(*) filter (where score >= 80 and score < 120),
        '주의', count(*) filter (where score >= 50 and score < 80),
        '제한', count(*) filter (where score < 50))
      from public.profiles
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;
