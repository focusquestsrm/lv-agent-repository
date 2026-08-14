-- Lead Ventures Agent Registry: empty production schema
create extension if not exists pgcrypto;
create type public.app_role as enum ('admin','editor','viewer');
create type public.workflow_status as enum ('draft','pending','approved','changes_requested','retired');
create type public.risk_level as enum ('low','medium','high','critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'viewer',
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.agents (
  id uuid primary key default gen_random_uuid(), name text not null, description text not null,
  owner_name text not null, platform text not null, environment text not null, url text,
  status public.workflow_status not null default 'draft', risk_level public.risk_level not null default 'low',
  governance_score integer check(governance_score between 0 and 100), created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.agents(id) on delete cascade,
  version_number integer not null, prompt_text text not null, change_explanation text not null,
  status public.workflow_status not null default 'pending', created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id), approved_at timestamptz, created_at timestamptz not null default now(),
  unique(agent_id,version_number)
);
create table public.governance_reviews (
  id uuid primary key default gen_random_uuid(), agent_id uuid not null references public.agents(id) on delete cascade,
  prompt_version_id uuid references public.prompt_versions(id) on delete cascade, category text not null,
  score integer not null check(score between 0 and 100), status text not null check(status in ('passed','attention','failed')),
  findings text, reviewer_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
  action text not null, entity_type text not null, entity_id text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);

create function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into profiles(id,email,full_name,role) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),case when lower(new.email)='danielle@focusquest.com' or not exists(select 1 from profiles) then 'admin'::app_role else 'viewer'::app_role end);return new;end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
create trigger agents_updated before update on public.agents for each row execute procedure public.touch_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;alter table public.agents enable row level security;alter table public.prompt_versions enable row level security;alter table public.governance_reviews enable row level security;alter table public.audit_log enable row level security;
create policy "authenticated read profiles" on public.profiles for select to authenticated using(true);
create policy "admins update profiles" on public.profiles for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy "authenticated read agents" on public.agents for select to authenticated using(true);
create policy "editors create agents" on public.agents for insert to authenticated with check(public.current_role() in ('admin','editor'));
create policy "editors update agents" on public.agents for update to authenticated using(public.current_role() in ('admin','editor')) with check(public.current_role() in ('admin','editor'));
create policy "authenticated read versions" on public.prompt_versions for select to authenticated using(true);
create policy "editors create versions" on public.prompt_versions for insert to authenticated with check(public.current_role() in ('admin','editor') and created_by=auth.uid());
create policy "admins approve versions" on public.prompt_versions for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin' and approved_by=auth.uid() and created_by<>auth.uid());
create policy "authenticated read governance" on public.governance_reviews for select to authenticated using(true);
create policy "editors create governance" on public.governance_reviews for insert to authenticated with check(public.current_role() in ('admin','editor') and reviewer_id=auth.uid());
create policy "admins update governance" on public.governance_reviews for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy "authenticated read audit" on public.audit_log for select to authenticated using(true);
create index agents_status_idx on public.agents(status);create index versions_agent_idx on public.prompt_versions(agent_id,version_number desc);create index versions_status_idx on public.prompt_versions(status);create index reviews_agent_idx on public.governance_reviews(agent_id);create index audit_created_idx on public.audit_log(created_at desc);
