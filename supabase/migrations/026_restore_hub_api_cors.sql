-- Restore browser access to the Data API after the production application
-- moved from agentrepository.lead-ventures.com to thehub.lead-ventures.com.
--
-- This changes PostgREST transport configuration only. It does not change
-- grants, RLS policies, tenant boundaries, or application data. Keep the
-- former production origin during the transition so existing bookmarks and
-- rollback deployments continue to work.
alter role authenticator set pgrst.server_cors_allowed_origins =
  'https://agentrepository.lead-ventures.com, https://thehub.lead-ventures.com';

-- Ask PostgREST to read the updated in-database configuration. If the hosted
-- PostgREST version requires a service restart for this setting, restart the
-- Data API once from the project dashboard after applying this migration.
notify pgrst, 'reload config';

-- Rollback, if the new production hostname is retired:
-- alter role authenticator set pgrst.server_cors_allowed_origins =
--   'https://agentrepository.lead-ventures.com';
-- notify pgrst, 'reload config';
