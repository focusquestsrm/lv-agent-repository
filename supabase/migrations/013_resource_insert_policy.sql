-- Correct resource creation RLS without weakening Editor access controls.
-- The BEFORE INSERT trigger from migration 010 remains responsible for forcing
-- Editor-created resources to Owner Only with the Editor as accountable owner.

drop policy if exists "editors create agents" on public.agents;
drop policy if exists "editors create agents and skillsets" on public.agents;
drop policy if exists "authorized create agents and skillsets" on public.agents;
drop policy if exists "authorized create resources" on public.agents;

create policy "authorized create resources"
on public.agents
for insert
to authenticated
with check (
  public.current_role() in ('admin', 'editor')
  and created_by = auth.uid()
);

notify pgrst, 'reload schema';
