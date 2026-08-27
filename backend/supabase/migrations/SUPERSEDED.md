# These migrations are superseded - do not apply them

The files in this folder (`0001_core_multitenancy.sql` through `0008_disposition_rules.sql`) were the **original speculative schema**, designed before this backend was connected to a real Supabase project.

**The backend now targets a different, already-existing, already-applied schema** in a live Supabase project (26 migrations, `organizations`/`clients`/`client_members`/`integrations`/`integration_accounts`/`leads`/`meta_campaigns`/`google_campaigns`/`creatives`/`sync_jobs`/`sync_runs`/etc., plus RLS policies and reporting views already in place). All of `src/repositories/`, `src/types/database.ts`, and the SQL functions this backend calls (`fn_campaign_performance_range`, `fn_creative_performance_range`, `fn_source_performance_range`, `get_integration_credentials`, `upsert_integration_credentials`, `clear_integration_credentials`) target **that** schema, not the one described by these files.

**Do not run these files against the connected project** - table and column names collide in spirit but not in fact (e.g. this backend's code expects `leads`, not `meritto_leads`; `meta_adsets`, not `meta_ad_sets`; `client_members`, not `client_access`), and applying both schemas to the same database would create confusing duplicate/conflicting objects.

Kept for historical reference only - see `ARCHITECTURE.md` for the real, current data model, and the four small additive migrations actually applied to the live project:

- `backend_credentials_bridge_functions` / `credentials_bridge_functions_use_base64_text_v2` - `get_integration_credentials` / `upsert_integration_credentials` / `clear_integration_credentials`, bridging the (deliberately API-inaccessible) `secrets.integration_credentials` table
- `backend_date_ranged_reporting_functions` / `fix_source_performance_range_null_revenue` - `fn_campaign_performance_range`, `fn_creative_performance_range`, `fn_source_performance_range` (the live project's own reporting views are all-time aggregates; the dashboard spec requires date-range filtering)
- `lead_status_rules` - client-configurable raw-disposition -> status mapping table (the live project's `lead_statuses` is a status catalog, not a mapping table)
- `sync_jobs_metadata_column` - adds a `metadata jsonb` column to `sync_jobs` to hold the exact cron expression/timezone/Trigger.dev schedule id (the existing `frequency` enum is too coarse for a specific per-client morning-sync time)

Run `supabase db pull` (or `list_migrations` via the Supabase MCP tools) against the connected project to see the authoritative, current migration history.
