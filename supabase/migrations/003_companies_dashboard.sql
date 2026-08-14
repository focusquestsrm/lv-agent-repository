-- Run once after 002_self_service_auth.sql on an existing Supabase project.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  website text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.agents add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.profiles alter column role set default 'editor'::public.app_role;

alter table public.companies enable row level security;

drop policy if exists "authenticated read companies" on public.companies;
create policy "authenticated read companies" on public.companies for select to authenticated using (true);
drop policy if exists "admins create companies" on public.companies;
create policy "admins create companies" on public.companies for insert to authenticated
with check (public.current_role()='admin' and created_by=auth.uid());
drop policy if exists "admins update companies" on public.companies;
create policy "admins update companies" on public.companies for update to authenticated
using (public.current_role()='admin') with check (public.current_role()='admin');

drop trigger if exists companies_updated on public.companies;
create trigger companies_updated before update on public.companies
for each row execute procedure public.touch_updated_at();

create index if not exists profiles_company_idx on public.profiles(company_id);
create index if not exists agents_company_idx on public.agents(company_id);

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
      else 'editor'::app_role
    end
  )
  on conflict(id) do update set
    email=excluded.email,
    full_name=coalesce(nullif(excluded.full_name,''),profiles.full_name),
    role=case when lower(excluded.email)='danielle@focusquest.com' then 'admin'::app_role else profiles.role end;
  return new;
end
$$;
