-- 시연용 샘플 데이터 지우기 (sampleNN@example.com 회원과 그 기록만 지움)
begin;
create temp table _s on commit drop as
  select id from auth.users where email like 'sample%@example.com';
delete from public.notices where user_id in (select id from _s);
delete from public.appeals where user_id in (select id from _s);
delete from public.payments where user_id in (select id from _s);
delete from public.waitlist where user_id in (select id from _s);
delete from public.score_logs where user_id in (select id from _s);
delete from public.slot_holds where user_id in (select id from _s);
delete from public.reservations where user_id in (select id from _s);
delete from auth.users where id in (select id from _s);
-- 샘플로 넣은 인기 시간대 (직접 같은 값을 넣었다면 그것도 지워짐)
delete from public.peak_hours where resource_id = 1
  and ((weekday between 2 and 5 and hour in (18, 19)) or (weekday = 6 and hour in (13, 14)));
commit;
