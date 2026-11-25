-- This project does not auto-grant data privileges to API roles. RLS policies decide WHICH rows;
-- these grants decide WHETHER a role may touch the table at all. Least privilege, matching the policies.

grant select, update                   on public.profiles          to authenticated;
grant select, insert, update, delete   on public.trips             to authenticated;
grant select                           on public.trip_members      to authenticated;
grant select, insert, update           on public.preferences       to authenticated;
grant select, insert, update           on public.member_budgets    to authenticated;
grant select                           on public.places            to authenticated;
grant select, insert, update           on public.plans             to authenticated;
grant select, insert, update, delete   on public.plan_options      to authenticated;
grant select, insert                   on public.votes             to authenticated;   -- immutable: no update/delete
grant select, insert, update, delete   on public.trip_candidates   to authenticated;
grant select, insert, update, delete   on public.expenses          to authenticated;
grant select                           on public.expense_splits    to authenticated;
grant select, insert, update           on public.settlements       to authenticated;   -- history kept: no delete
grant select, insert, update, delete   on public.reminder_settings to authenticated;
grant select                           on public.reminder_log      to authenticated;
grant select                           on public.ai_jobs           to authenticated;
-- invitations: column-level select (no token_hash, no email) was granted in the first migration.

-- Server-side service role: bypasses RLS but still needs table privileges.
grant select, insert, update, delete on all tables in schema public to service_role;