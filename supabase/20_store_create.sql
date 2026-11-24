-- 여러 매장 3단계: 회원이 매장을 만들면 그 매장의 주인이 됨
-- 업종은 정해진 목록에서 고름. 업종마다 예약 방식(1인, 인원)이 정해져 있고 정원은 다음 단계에서 씀
-- 매장 관리(예약 대상, 판정)는 2단계(매장 주인 권한)에서 열 예정

alter table public.stores drop constraint if exists stores_category_check;
alter table public.stores add constraint stores_category_check
  check (category in ('hair', 'clinic', 'lab', 'restaurant', 'cafe', 'class', 'etc'));

create or replace function public.create_store(p_name text, p_slug text, p_category text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then
    raise exception 'NOT_LOGGED_IN';
  end if;
  -- 지금은 한 사람이 매장 하나
  if exists (select 1 from public.stores where owner_id = v_uid) then
    raise exception 'ALREADY_OWNER';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'BAD_NAME';
  end if;
  if coalesce(p_slug, '') !~ '^[a-z0-9-]{3,30}$' then
    raise exception 'BAD_SLUG';
  end if;
  if coalesce(p_category, '') not in ('hair', 'clinic', 'lab', 'restaurant', 'cafe', 'class', 'etc') then
    raise exception 'BAD_CATEGORY';
  end if;

  insert into public.stores (name, slug, category, owner_id)
  values (trim(p_name), p_slug, p_category, v_uid)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN';
end $$;

revoke all on function public.create_store(text, text, text) from public, anon;
grant execute on function public.create_store(text, text, text) to authenticated;
