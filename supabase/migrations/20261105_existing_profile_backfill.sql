-- Restore profiles for accounts created before the profile trigger existed.
insert into public.profiles(id,login,nickname,avatar)
select id,
  coalesce(nullif(raw_user_meta_data->>'login',''),split_part(email,'@',1)),
  coalesce(nullif(raw_user_meta_data->>'nickname',''),nullif(raw_user_meta_data->>'login',''),split_part(email,'@',1)),
  coalesce(raw_user_meta_data->'avatar','{}'::jsonb)
from auth.users
on conflict(id) do nothing;
