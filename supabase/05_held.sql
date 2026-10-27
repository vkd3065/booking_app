-- 다른 사람이 확인 창을 띄워 둔(결정 중인) 시간 조회 (누가인지는 안 보냄)
create or replace function public.get_held_slots(p_resource_id bigint, p_day date)
returns setof timestamptz
language sql stable security definer set search_path = ''
as $$
  select distinct h.slot
  from public.slot_holds h
  where h.resource_id = p_resource_id
    and h.user_id <> auth.uid()
    and h.expires_at > now()
    and h.slot >= (p_day::timestamp at time zone 'Asia/Seoul')
    and h.slot <  ((p_day + 1)::timestamp at time zone 'Asia/Seoul');
$$;

revoke all on function public.get_held_slots(bigint, date) from public, anon;
grant execute on function public.get_held_slots(bigint, date) to authenticated;
