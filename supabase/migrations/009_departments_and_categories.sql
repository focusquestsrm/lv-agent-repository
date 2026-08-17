-- Managed departments and categories for agent and skillset registration.
-- Idempotent and safe for existing installations: agent text values are preserved.

-- Some installations intentionally skipped migration 004, where these optional
-- registry fields were first introduced. Add them here before importing values.
alter table public.agents add column if not exists department text;
alter table public.agents add column if not exists category text;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists departments_name_ci_idx
on public.departments (lower(trim(name)));
create unique index if not exists categories_name_ci_idx
on public.categories (lower(trim(name)));
create index if not exists departments_status_name_idx
on public.departments (status, name);
create index if not exists categories_status_name_idx
on public.categories (status, name);

alter table public.departments enable row level security;
alter table public.categories enable row level security;

drop policy if exists "authenticated read departments" on public.departments;
create policy "authenticated read departments" on public.departments
for select to authenticated
using (status = 'active' or public.current_role() = 'admin');
drop policy if exists "admins create departments" on public.departments;
create policy "admins create departments" on public.departments
for insert to authenticated
with check (public.current_role() = 'admin' and created_by = auth.uid());
drop policy if exists "admins update departments" on public.departments;
create policy "admins update departments" on public.departments
for update to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

drop policy if exists "authenticated read categories" on public.categories;
create policy "authenticated read categories" on public.categories
for select to authenticated
using (status = 'active' or public.current_role() = 'admin');
drop policy if exists "admins create categories" on public.categories;
create policy "admins create categories" on public.categories
for insert to authenticated
with check (public.current_role() = 'admin' and created_by = auth.uid());
drop policy if exists "admins update categories" on public.categories;
create policy "admins update categories" on public.categories
for update to authenticated
using (public.current_role() = 'admin')
with check (public.current_role() = 'admin');

grant select, insert, update on public.departments to authenticated;
grant select, insert, update on public.categories to authenticated;

drop trigger if exists departments_updated on public.departments;
create trigger departments_updated before update on public.departments
for each row execute procedure public.touch_updated_at();
drop trigger if exists categories_updated on public.categories;
create trigger categories_updated before update on public.categories
for each row execute procedure public.touch_updated_at();

insert into public.categories (name)
select seed.name
from (values
  ('Customer Service'),
  ('Marketing and Content'),
  ('Sales and Lead Generation'),
  ('Data and Analytics'),
  ('Research'),
  ('Process Automation'),
  ('Finance'),
  ('Human Resources'),
  ('Compliance and Risk'),
  ('Education and Student Support'),
  ('Software Development'),
  ('General Productivity')
) as seed(name)
where not exists (
  select 1 from public.categories existing
  where lower(trim(existing.name)) = lower(seed.name)
);

insert into public.departments (name)
select min(trim(agent.department))
from public.agents agent
where nullif(trim(agent.department), '') is not null
  and not exists (
    select 1 from public.departments existing
    where lower(trim(existing.name)) = lower(trim(agent.department))
  )
group by lower(trim(agent.department));

insert into public.categories (name)
select min(trim(agent.category))
from public.agents agent
where nullif(trim(agent.category), '') is not null
  and not exists (
    select 1 from public.categories existing
    where lower(trim(existing.name)) = lower(trim(agent.category))
  )
group by lower(trim(agent.category));
