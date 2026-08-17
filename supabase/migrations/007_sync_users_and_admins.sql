-- Synchronize Supabase Authentication users with the app's access profiles.
-- Safe to run after the existing migrations. It does not delete user data.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when lower(new.email) in (
        'danielle@focusquest.com',
        'sean@focusquest.com',
        'eliana@lead-ventures.com',
        'mcarcamo@back2learn.com'
      ) then 'admin'::public.app_role
      else 'editor'::public.app_role
    end,
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, full_name, role, status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  case
    when lower(u.email) in (
      'danielle@focusquest.com',
      'sean@focusquest.com',
      'eliana@lead-ventures.com',
      'mcarcamo@back2learn.com'
    ) then 'admin'::public.app_role
    else 'editor'::public.app_role
  end,
  'active'
from auth.users u
where u.email is not null
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
  updated_at = now();

update public.profiles
set role = 'admin'::public.app_role,
    updated_at = now()
where lower(email) in (
  'danielle@focusquest.com',
  'sean@focusquest.com',
  'eliana@lead-ventures.com',
  'mcarcamo@back2learn.com'
);
