-- 아이디(이메일) 찾기
-- 가입할 때 입력한 이름으로 찾고, 이메일은 앞부분만 보여 줌 (예: vk***@gmail.com)
-- 로그인 전에 쓰는 기능이라 anon도 실행 가능. 전체 이메일은 절대 돌려주지 않음

create or replace function public.find_login_email(p_name text)
returns table (email text, joined date)
language sql stable security definer set search_path = ''
as $$
  select
    left(split_part(u.email, '@', 1),
         case when length(split_part(u.email, '@', 1)) <= 3 then 1 else 2 end)
      || '***@' || split_part(u.email, '@', 2),
    (u.created_at at time zone 'Asia/Seoul')::date
  from public.profiles p
  join auth.users u on u.id = p.id
  where char_length(trim(coalesce(p_name, ''))) >= 2
    and p.name = trim(p_name)
  order by u.created_at
  limit 5;
$$;

revoke all on function public.find_login_email(text) from public;
grant execute on function public.find_login_email(text) to anon, authenticated;
