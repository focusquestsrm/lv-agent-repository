-- Admin-selectable governance provider. Secret API keys remain in Netlify.
create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
drop policy if exists "authenticated read app settings" on public.app_settings;
create policy "authenticated read app settings" on public.app_settings for select to authenticated using (true);
drop policy if exists "admins insert app settings" on public.app_settings;
create policy "admins insert app settings" on public.app_settings for insert to authenticated
with check (public.current_role()='admin' and updated_by=auth.uid());
drop policy if exists "admins update app settings" on public.app_settings;
create policy "admins update app settings" on public.app_settings for update to authenticated
using (public.current_role()='admin') with check (public.current_role()='admin' and updated_by=auth.uid());

insert into public.app_settings(setting_key,setting_value)
values ('governance_provider','anthropic'),('governance_model','')
on conflict(setting_key) do nothing;

-- Legacy test and low-risk prompts should not remain in the risk approval queue.
update public.prompt_versions pv
set status='approved'::public.workflow_status,
    approved_at=coalesce(pv.approved_at,now())
from public.agents a
where pv.agent_id=a.id
  and pv.status='pending'::public.workflow_status
  and coalesce(a.governance_flagged,false)=false;
