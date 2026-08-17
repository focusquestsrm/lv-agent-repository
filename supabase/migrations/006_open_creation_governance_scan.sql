-- Remove the pre-build authorization gate and add automated governance results.
-- Existing request records are preserved for audit/history but are no longer required.

alter table public.agents add column if not exists entry_type text not null default 'agent'
  check (entry_type in ('agent','skillset'));
alter table public.agents add column if not exists skills_summary text;
alter table public.agents add column if not exists governance_flagged boolean not null default false;
alter table public.agents add column if not exists governance_summary text;
alter table public.agents add column if not exists governance_checked_at timestamptz;
alter table public.agents add column if not exists governance_provider text;

drop policy if exists "editors create approved agents" on public.agents;
drop policy if exists "editors create agents" on public.agents;
create policy "editors create agents and skillsets" on public.agents
for insert to authenticated
with check (
  public.current_role() in ('admin','editor')
  and created_by=auth.uid()
);

create index if not exists agents_governance_flagged_idx
on public.agents(governance_flagged, risk_level);
