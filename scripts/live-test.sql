-- 실제 서버 시나리오 테스트 (11/18). 테스트 계정 test01~03@example.com (비밀번호 없음, 로그인 불가)
-- 단계마다 따로 커밋해서 실제로 하나씩 누른 것과 같은 순서, 시각으로 기록됨
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e, '', now(), now(), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', n, 'test', true), '', '', '', ''
from (values ('test01@example.com', '테스트1'), ('test02@example.com', '테스트2'), ('test03@example.com', '테스트3')) v(e, n)
where not exists (select 1 from auth.users where email = v.e);
create temp table if not exists _r (n serial, at timestamptz default clock_timestamp(), step text, who text, result text);
create or replace function pg_temp._step(p_label text, p_email text, p_who text, p_sql text) returns void language plpgsql as $f$
declare v text; uid uuid;
begin
  if p_email is null then uid := null;
  elsif p_email = 'admin' then select id into uid from public.profiles where is_admin order by member_no limit 1;
  else select id into uid from auth.users where email = p_email; end if;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  begin
    execute p_sql into v;
    insert into _r (step, who, result) values (p_label, p_who, coalesce(nullif(v, ''), '성공'));
  exception when others then
    insert into _r (step, who, result) values (p_label, p_who, '오류 ' || sqlerrm);
  end;
end $f$;
begin; select pg_temp._step('1. 우선권: 11/20 14시 자원C 칸 누름', 'test01@example.com', '테스트1', $q$select '앞사람 ' || public.hold_slot(3, '2026-11-20 14:00:00+09') || '명'$q$); commit;
begin; select pg_temp._step('1. 같은 칸 누름', 'test02@example.com', '테스트2', $q$select '앞사람 ' || public.hold_slot(3, '2026-11-20 14:00:00+09') || '명'$q$); commit;
begin; select pg_temp._step('1. 뒤에 누른 사람이 먼저 예약하기', 'test02@example.com', '테스트2', $q$select '예약됨 #' || public.book_slot(3, '2026-11-20 14:00:00+09')$q$); commit;
begin; select pg_temp._step('1. 먼저 누른 사람 예약하기', 'test01@example.com', '테스트1', $q$select '예약됨 #' || public.book_slot(3, '2026-11-20 14:00:00+09')$q$); commit;
begin; select pg_temp._step('1. 2일 전 취소', 'test01@example.com', '테스트1', $q$select public.cancel_booking((select id from public.reservations where user_id = (select id from auth.users where email = 'test01@example.com') and resource_id = 3 and slot = '2026-11-20 14:00:00+09' and status = 'booked' order by id desc limit 1))::text$q$); commit;
begin; select pg_temp._step('2. 27일 뒤 예약 (일반 14일)', 'test01@example.com', '테스트1', $q$select '예약됨 #' || public.book_slot(3, '2026-12-15 13:00:00+09')$q$); commit;
begin; select pg_temp._step('2. 운영 시간 밖(21시) 예약', 'test01@example.com', '테스트1', $q$select '예약됨 #' || public.book_slot(3, '2026-11-20 21:00:00+09')$q$); commit;
begin; select pg_temp._step('2. 이미 지난 시간 예약', 'test01@example.com', '테스트1', $q$select '예약됨 #' || public.book_slot(3, '2026-11-18 09:00:00+09')$q$); commit;
begin; select pg_temp._step('3. 11/20 13시 자원C 예약', 'test01@example.com', '테스트1', $q$select '앞사람 ' || public.hold_slot(3, '2026-11-20 13:00:00+09') || '명, 예약됨 #' || public.book_slot(3, '2026-11-20 13:00:00+09')$q$); commit;
begin; select pg_temp._step('3. 같은 칸 누름', 'test02@example.com', '테스트2', $q$select '앞사람 ' || public.hold_slot(3, '2026-11-20 13:00:00+09') || '명'$q$); commit;
begin; select pg_temp._step('3. 대기 신청', 'test02@example.com', '테스트2', $q$select '대기 #' || public.join_waitlist(3, '2026-11-20 13:00:00+09')$q$); commit;
begin; select pg_temp._step('3. 같은 칸 대기 신청 한 번 더', 'test02@example.com', '테스트2', $q$select '대기 #' || public.join_waitlist(3, '2026-11-20 13:00:00+09')$q$); commit;
begin; select pg_temp._step('3. 대기 신청', 'test03@example.com', '테스트3', $q$select '대기 #' || public.join_waitlist(3, '2026-11-20 13:00:00+09')$q$); commit;
begin; select pg_temp._step('3. 내 예약 칸에 대기 신청', 'test01@example.com', '테스트1', $q$select '대기 #' || public.join_waitlist(3, '2026-11-20 13:00:00+09')$q$); commit;
begin; select pg_temp._step('3. 예약 취소 (대기자 있음)', 'test01@example.com', '테스트1', $q$select public.cancel_booking((select id from public.reservations where user_id = (select id from auth.users where email = 'test01@example.com') and resource_id = 3 and slot = '2026-11-20 13:00:00+09' and status = 'booked' order by id desc limit 1))::text$q$); commit;
begin; select pg_temp._step('3. 자동 배정 확인', null, '로그인 전', $q$select coalesce((select p.name from public.reservations r join public.profiles p on p.id = r.user_id where r.resource_id = 3 and r.slot = '2026-11-20 13:00:00+09' and r.status = 'booked'), '없음') || '에게 배정, 알림 ' || (select count(*) from public.notices n join auth.users u on u.id = n.user_id where u.email = 'test02@example.com' and n.kind = 'assigned') || '건'$q$); commit;
begin; select pg_temp._step('4. 두 번째 예약', 'test02@example.com', '테스트2', $q$select '예약됨 #' || public.book_slot(3, '2026-11-21 10:00:00+09')$q$); commit;
begin; select pg_temp._step('4. 세 번째 예약 (일반 2건 한도)', 'test02@example.com', '테스트2', $q$select '예약됨 #' || public.book_slot(3, '2026-11-22 10:00:00+09')$q$); commit;
begin; select pg_temp._step('4. 알림 모두 확인', 'test02@example.com', '테스트2', $q$select public.read_notices()::text$q$); commit;
begin; select pg_temp._step('5. 오늘 17시 예약 후 바로 취소 (마감 24시간 전 지남)', 'test03@example.com', '테스트3', $q$select public.cancel_booking(public.book_slot(3, '2026-11-18 17:00:00+09'))::text$q$); commit;
begin; select pg_temp._step('5. 오늘 18시 예약 후 바로 취소', 'test03@example.com', '테스트3', $q$select public.cancel_booking(public.book_slot(3, '2026-11-18 18:00:00+09'))::text$q$); commit;
begin; select pg_temp._step('5. 점수 확인', 'test03@example.com', '테스트3', $q$select '점수 ' || score || ', 늦은 취소 ' || (select count(*) from public.reservations where user_id = p.id and status = 'canceled_late') || '건' from public.profiles p join auth.users u on u.id = p.id where u.email = 'test03@example.com'$q$); commit;
begin; select pg_temp._step('5. 주의 등급으로 인기 시간대(목 19시 자원A) 예약', 'test03@example.com', '테스트3', $q$select '예약됨 #' || public.book_slot(1, '2026-11-19 19:00:00+09')$q$); commit;
begin; select pg_temp._step('5. 주의 등급으로 8일 뒤 예약 (주의 7일)', 'test03@example.com', '테스트3', $q$select '예약됨 #' || public.book_slot(3, '2026-11-26 10:00:00+09')$q$); commit;
begin; select pg_temp._step('5. 늦은 취소에 이의신청', 'test03@example.com', '테스트3', $q$select '신청 #' || public.submit_appeal((select id from public.reservations where user_id = (select id from auth.users where email = 'test03@example.com') and resource_id = 3 and slot = '2026-11-18 17:00:00+09' and status = 'canceled_late' order by id desc limit 1), '테스트로 늦은 취소에 이의신청을 넣어 봄')$q$); commit;
begin; select pg_temp._step('5. 대기 신청 취소', 'test03@example.com', '테스트3', $q$select public.leave_waitlist((select w.id from public.waitlist w join auth.users u on u.id = w.user_id where u.email = 'test03@example.com' and w.status = 'waiting' limit 1))::text$q$); commit;
begin; select pg_temp._step('6. 관리자 통계 조회', 'test01@example.com', '테스트1', $q$select (public.admin_stats(7)->>'total')$q$); commit;
begin; select pg_temp._step('6. 요금 0원으로 변경', 'test01@example.com', '테스트1', $q$select public.set_resource_price(3, 0)::text$q$); commit;
begin; select pg_temp._step('6. 관리자 통계 조회 (7일)', 'admin', '관리자', $q$select '최근 7일 ' || (public.admin_stats(7)->>'total') || '건'$q$); commit;
begin; select pg_temp._step('7. 아이디 찾기 "테스트2"', null, '로그인 전', $q$select coalesce((select string_agg(email, ', ') from public.find_login_email('테스트2')), '없음')$q$); commit;
select n, to_char(at at time zone 'Asia/Seoul', 'HH24:MI:SS') as at, step, who, result from _r order by n;
