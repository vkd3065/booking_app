-- 테스트용 결제 (A6)
-- 실제 결제는 하지 않고 결제 기록만 남김. 예약 시각 이후 결제하면 방문으로 자동 처리

alter table public.resources add column if not exists price int not null default 10000 check (price >= 0);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  reservation_id bigint not null unique references public.reservations(id), -- 예약 하나에 결제 한 번
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null,
  method text not null default 'test',
  paid_at timestamptz not null default now()
);

alter table public.payments enable row level security;

drop policy if exists "내 결제 조회" on public.payments;
create policy "내 결제 조회"
  on public.payments for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.payments to authenticated;

-- 결제: 예약 시각이 된 내 예약만. 결제되면 방문 처리(+5점)까지 한 번에
create or replace function public.pay_reservation(p_id bigint)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_res    bigint;
  v_slot   timestamptz;
  v_amount int;
  v_delta  int;
begin
  -- 예약 행을 잠가서 관리자 판정과 동시에 처리되지 않게 함
  select resource_id, slot into v_res, v_slot
  from public.reservations
  where id = p_id and user_id = v_uid and status = 'booked'
  for update;
  if not found then
    raise exception 'CANNOT_PAY';
  end if;
  if v_slot > now() then
    raise exception 'TOO_EARLY';
  end if;

  select price into v_amount from public.resources where id = v_res;
  insert into public.payments (reservation_id, user_id, amount)
  values (p_id, v_uid, v_amount);

  -- 결제 기록이 있으면 방문으로 자동 처리
  v_delta := public.apply_score(v_uid, 5, '방문 (결제)', p_id);
  update public.reservations set status = 'done', score_delta = v_delta where id = p_id;
  return v_amount;
exception
  when unique_violation then
    raise exception 'ALREADY_PAID';
end $$;

revoke all on function public.pay_reservation(bigint) from public, anon;
grant execute on function public.pay_reservation(bigint) to authenticated;

-- 관리자가 예약 대상별 요금 변경 (예약 대상 관리 화면에서 사용)
create or replace function public.set_resource_price(p_id bigint, p_price int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'BAD_PRICE';
  end if;
  update public.resources set price = p_price where id = p_id;
end $$;

revoke all on function public.set_resource_price(bigint, int) from public, anon;
grant execute on function public.set_resource_price(bigint, int) to authenticated;
