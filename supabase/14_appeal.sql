-- 노쇼 이의신청 (A9)
-- 노쇼 판정을 받은 회원이 사유를 적어 신청 -> 관리자가 수락하면 깎인 점수를 되돌림

-- 이의신청이 받아들여진 예약 상태 추가 (노쇼 기록에서 빠짐)
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('booked', 'done', 'no_show', 'canceled', 'canceled_late', 'excused'));

create table if not exists public.appeals (
  id bigint generated always as identity primary key,
  reservation_id bigint not null unique references public.reservations(id), -- 예약 하나에 한 번
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table public.appeals enable row level security;

drop policy if exists "내 이의신청 조회" on public.appeals;
create policy "내 이의신청 조회"
  on public.appeals for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.appeals to authenticated;

-- 이의신청: 내 노쇼 예약, 예약 시각부터 7일 안에만
create or replace function public.submit_appeal(p_res bigint, p_reason text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_slot timestamptz;
  v_id   bigint;
begin
  select slot into v_slot
  from public.reservations
  where id = p_res and user_id = v_uid and status = 'no_show';
  if not found then
    raise exception 'CANNOT_APPEAL';
  end if;
  if now() > v_slot + interval '7 days' then
    raise exception 'APPEAL_EXPIRED';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'REASON_SHORT';
  end if;

  insert into public.appeals (reservation_id, user_id, reason)
  values (p_res, v_uid, left(trim(p_reason), 500))
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'ALREADY_APPEALED';
end $$;

-- 관리자 결정. 수락하면 노쇼로 깎인 점수만큼 되돌리고 예약은 'excused'로
create or replace function public.decide_appeal(p_id bigint, p_accept boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_res   bigint;
  v_user  uuid;
  v_slot  timestamptz;
  v_delta int;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  -- 같은 신청을 두 번 처리하지 않게 잠금
  select reservation_id, user_id into v_res, v_user
  from public.appeals
  where id = p_id and status = 'pending'
  for update;
  if not found then
    raise exception 'ALREADY_DECIDED';
  end if;

  select slot, score_delta into v_slot, v_delta
  from public.reservations
  where id = v_res
  for update;

  if p_accept then
    -- 판정이 이미 취소된 경우 등 노쇼가 아니면 점수는 건드리지 않음
    if exists (select 1 from public.reservations where id = v_res and status = 'no_show') then
      perform public.apply_score(v_user, -v_delta, '이의신청 수락', v_res);
      update public.reservations set status = 'excused', score_delta = 0 where id = v_res;
    end if;
  end if;

  update public.appeals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      admin_note = nullif(trim(coalesce(p_note, '')), ''),
      decided_at = now()
  where id = p_id;

  insert into public.notices (user_id, reservation_id, kind, body)
  values (v_user, v_res, 'appeal',
          public.kst_label(v_slot) || ' 노쇼 이의신청이 '
          || case when p_accept then '수락되어 ' || -v_delta || '점이 복구되었습니다.' else '거절되었습니다.' end
          || coalesce(' (' || nullif(trim(coalesce(p_note, '')), '') || ')', ''))
  on conflict (reservation_id, kind) do nothing;
end $$;

revoke all on function public.submit_appeal(bigint, text) from public, anon;
revoke all on function public.decide_appeal(bigint, boolean, text) from public, anon;
grant execute on function public.submit_appeal(bigint, text) to authenticated;
grant execute on function public.decide_appeal(bigint, boolean, text) to authenticated;
