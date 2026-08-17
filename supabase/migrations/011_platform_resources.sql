-- Add Platform as a governed resource type without changing existing records.

alter table public.agents drop constraint if exists agents_entry_type_check;
alter table public.agents add constraint agents_entry_type_check
  check (entry_type in ('agent','skillset','platform'));

create table if not exists public.platform_details (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  vendor text,
  license_type text,
  access_request_instructions text,
  support_contact text,
  data_classification_restrictions text,
  approved_use_guidance text,
  prohibited_use_guidance text,
  renewal_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_details_renewal_idx
on public.platform_details(renewal_at);

alter table public.platform_details enable row level security;

drop policy if exists "authorized read platform details" on public.platform_details;
create policy "authorized read platform details" on public.platform_details
for select to authenticated
using (public.can_access_agent(agent_id));

drop policy if exists "managers create platform details" on public.platform_details;
create policy "managers create platform details" on public.platform_details
for insert to authenticated
with check (public.can_manage_agent(agent_id));

drop policy if exists "managers update platform details" on public.platform_details;
create policy "managers update platform details" on public.platform_details
for update to authenticated
using (public.can_manage_agent(agent_id))
with check (public.can_manage_agent(agent_id));

drop policy if exists "admins delete platform details" on public.platform_details;
drop policy if exists "managers delete platform details" on public.platform_details;
create policy "managers delete platform details" on public.platform_details
for delete to authenticated
using (public.can_manage_agent(agent_id));

grant select, insert, update, delete on public.platform_details to authenticated;

drop trigger if exists platform_details_updated on public.platform_details;
create trigger platform_details_updated before update on public.platform_details
for each row execute procedure public.touch_updated_at();
