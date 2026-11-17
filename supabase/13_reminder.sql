-- 예약 전날 알림 (A7)
-- 사이트 안 알림함에 넣음. 1시간마다 다음 24시간 안의 예약을 찾아 알림 (예약당 1번)

create table if not exists public.notices (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reservation_id bigint references public.reservations(id),
  kind text not null check (kind in ('reminder', 'assigned', 'appeal')),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- 같은 예약에 같은 알림은 한 번만
create unique index if not exists uniq_notice on public.notices (reservation_id, kind);
create index if not exists notices_user on public.notices (user_id, created_at desc);

alter table public.notices enable row level security;

drop policy if exists "내 알림 조회" on public.notices;
create policy "내 알림 조회"
  on public.notices for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.notices to authenticated;

-- 시각 표시용 (예: 11/18(수) 14시)
create or replace function public.kst_label(p_t timestamptz)
returns text
language sql immutable set search_path = ''
as $$
  select to_char(p_t at time zone 'Asia/Seoul', 'FMMM/FMDD')
    || '(' || (array['일','월','화','수','목','금','토'])[extract(dow from p_t at time zone 'Asia/Seoul')::int + 1] || ') '
    || to_char(p_t at time zone 'Asia/Seoul', 'FMHH24') || '시';
$$;

-- 다음 24시간 안의 예약에 알림을 넣음. 무료 취소 마감은 지금 등급 기준으로 안내
create or replace function public.send_reminders()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.notices (user_id, reservation_id, kind, body)
  select r.user_id, r.id, 'reminder',
         public.kst_label(r.slot) || ' ' || s.name || ' 예약이 있습니다. '
         || case
              when now() <= r.slot - make_interval(hours => h.hours)
                then '무료 취소는 ' || public.kst_label(r.slot - make_interval(hours => h.hours)) || '까지입니다.'
              else '무료 취소 마감이 지나 지금 취소하면 15점이 깎입니다. 오지 못하면 노쇼로 30점이 깎입니다.'
            end
  from public.reservations r
  join public.resources s on s.id = r.resource_id
  join public.profiles p on p.id = r.user_id
  cross join lateral (
    select case when p.score >= 120 then 2 when p.score >= 80 then 24 else 48 end as hours
  ) h
  where r.status = 'booked'
    and r.slot > now() and r.slot <= now() + interval '24 hours'
  on conflict (reservation_id, kind) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 대기 신청이 예약으로 바뀌면 알림 (A4 연결)
create or replace function public.notice_assigned()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_res bigint;
begin
  select id into v_res from public.reservations
  where user_id = new.user_id and resource_id = new.resource_id and slot = new.slot and status = 'booked';
  insert into public.notices (user_id, reservation_id, kind, body)
  values (new.user_id, v_res, 'assigned',
          '대기 신청한 ' || public.kst_label(new.slot) || ' 예약이 배정되었습니다. 오지 못하면 미리 취소해 주세요.')
  on conflict (reservation_id, kind) do nothing;
  return new;
end $$;

drop trigger if exists waitlist_assigned on public.waitlist;
create trigger waitlist_assigned
  after update of status on public.waitlist
  for each row when (new.status = 'assigned' and old.status = 'waiting')
  execute function public.notice_assigned();

-- 알림 확인 (p_id가 null이면 전부)
create or replace function public.read_notices(p_id bigint default null)
returns void
language sql security definer set search_path = ''
as $$
  update public.notices set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id);
$$;

revoke all on function public.send_reminders() from public, anon, authenticated;
revoke all on function public.notice_assigned() from public, anon, authenticated;
revoke all on function public.read_notices(bigint) from public, anon;
grant execute on function public.read_notices(bigint) to authenticated;

-- 매시 20분마다 실행
select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');
select cron.schedule('send-reminders', '20 * * * *', $$select public.send_reminders()$$);
