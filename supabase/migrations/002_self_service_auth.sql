-- Run this once in Supabase SQL Editor for an existing installation.
-- It guarantees the designated owner account receives Admin access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into profiles(id,email,full_name,role)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    case
      when lower(new.email)='danielle@focusquest.com' or not exists(select 1 from profiles)
        then 'admin'::app_role
      else 'viewer'::app_role
    end
  )
  on conflict(id) do update set
    email=excluded.email,
    full_name=coalesce(nullif(excluded.full_name,''),profiles.full_name),
    role=case when lower(excluded.email)='danielle@focusquest.com' then 'admin'::app_role else profiles.role end;
  return new;
end
$$;

-- Promote the account immediately if it already exists in Authentication.
insert into public.profiles(id,email,full_name,role,status)
select id,email,coalesce(raw_user_meta_data->>'full_name','Danielle Jennings'),'admin','active'
from auth.users
where lower(email)='danielle@focusquest.com'
on conflict(id) do update set role='admin',status='active';
