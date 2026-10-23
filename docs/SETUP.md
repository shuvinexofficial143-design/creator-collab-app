# Setup

1. Use a dedicated Supabase project. None of the connected projects were identified as belonging to this app, so none were modified.
2. Run all seven SQL files in `supabase/migrations/` in filename order in a new project's SQL editor, or apply with the installed Supabase CLI after following its `--help` and linking the correct project. The migrations create private submissions/project-media buckets, snapshot accepted terms, enforce deadlines/revisions, and add restricted orphan-delete policies. Verify revoked EXECUTE privileges for legacy workflow functions. Never apply to an unrelated production project.
3. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. No service-role key is required by this application.
4. Set APP_URL to the exact origin, e.g. http://localhost:3000 locally, and configure Supabase Auth Site URL and allowed redirect URLs including `/auth/callback` and `/auth/callback?next=/auth/reset`. Enable email confirmation and configure production SMTP.
5. Register the owner using the app and confirm their email. In the trusted Supabase SQL editor, promote only the verified owner's user UUID: `update public.profiles set role = 'ADMIN' where id = '<verified-owner-user-uuid>';`. Do not use user_metadata or browser-controlled role settings. There is no public admin password.
6. Run npm run dev. The Admin panel creates briefs, approves applications, dispatches products, reviews work and records payments. Use a separate creator account for the full workflow.
7. Vercel: import the repository, select the feature branch for a preview, use Next.js defaults, configure the above variables, and configure the exact preview/production callback origins in Supabase. Deployment has not been performed.

## Operational notes

- Payment amounts are stored as integer paise. Manual transfers happen outside this application; PAID requires a transaction reference.
- Project and extension deadline inputs use IST, are converted to UTC before storing, and display in IST. Shipping addresses are private.
- Uploads: private bucket; audio MP3/WAV/M4A/OGG, video MP4/WebM; maximum 100 MiB. MIME metadata is not malware inspection. Do not render uploads as HTML. Failed post-upload RPCs now check whether the file was linked, retry confirmation once and remove verified unlinked objects via Storage API; abandoned sessions can still require Admin-reviewed cleanup.
- Configure Supabase Auth rate limits/CAPTCHA before broad public signup. This app is intended for a small invited team.
- Review database security advisors in the actual project before launch. The private SECURITY DEFINER dispatcher deliberately centralizes transactions and validates actor/ownership on every operation. Its public wrapper is SECURITY INVOKER and anon has no EXECUTE grant.
- Bootstrap and account recovery actions should be performed only by the project owner. Never commit .env.local.

## Phase 2 operations

- Admins extend an open assignment's deadline with an explicitly agreed future UTC timestamp; this operation writes an audit event and notifies the creator. Extension is bounded to within 366 days and must move the deadline forward.
- Once a creator is approved, editable project content is locked against changes that would alter agreed terms. Status-only closure or archival remains possible. Do not edit SQL directly to bypass this.
- Product submissions require creator confirmation of delivery when shipping was created. A project with no required shipping does not need that step.
- Storage cleanup uses `storage.from(bucket).remove([path])`, not SQL `delete from storage.objects`. Do not loosen RLS for referenced media.
- Before production, verify Supabase hosted Auth/Storage workflows, permissions, real Android behavior and real external transfer procedures. Existing CI runs do not cover these integrations.

## Phase 3 upload/cleanup rollout

Apply the fourth migration after Phase 2 and deploy the matching frontend together. Storage INSERT now requires a registered upload session; old clients cannot upload new unregistered paths. Use `SUPABASE_TELEMETRY_DISABLED=1` for CLI maintenance (supported setting verified in installed CLI).

Admin → Storage cleanup is a preview. Tick the per-file authorization only after reviewing it. Cleanup revalidates age, lease, references and exact object UUID before deletion through Storage API; unknown failures keep a tombstone and may be retried. Never delete Storage metadata directly in production.

Uploads use Supabase TUS with 6 MiB chunks, no overwrite, and request-time session validation. Reselect the identical file to resume. A 100% progress bar means bytes transferred, not submitted; success is displayed only after linking the database record. Pending records are recoverable from the upload form.

## Phase 4 reporting and exports

- Apply `20261022123600_workspace_metrics.sql` after the earlier Phase 2/3 migrations, then apply the Phase 5 Admin search and project discovery migrations. The `workspace_metrics()` RPC uses SECURITY INVOKER and reads the caller's RLS-visible rows, not a service-role bypass.
- Earnings totals are database aggregates, not the sum of a possibly truncated browser list. Payment history pages contain at most 25 records.
- The Admin Operations History page links to four CSV exports under `/api/admin/export?kind=applications|payments|shipping|audit`. Exports require active ADMIN credentials. They reject datasets over 5,000 rows; do not send payment references or operational CSVs to untrusted recipients.
- The CSV export intentionally omits shipping addresses; access remains protected in the Admin dashboard and database. Uploaded media are never exported in the CSV.
- A 401 or 403 is expected for unauthenticated/non-Admin downloads once Supabase is configured. Real hosted acceptance must verify this.
- Security note: `braces@3.0.3` remains a vulnerable transitive development-only dependency with no patched npm version yet. See `docs/SECURITY_AUDIT.md`.

## Phase 5 hosted rollout

- Apply `20261023051500_admin_find_pending.sql` (Admin-only full-database application/review searches) and `20261023053500_find_projects.sql` (RLS-aware public-to-logged-in project discovery) after all five older migrations.
- Only perform this on a **new project explicitly designated for Creator Collab**. A successful isolated GitHub CI run does not execute SQL in Supabase.
- Ensure `APP_URL` is a clean HTTPS origin (except localhost for development) and run `npm run preflight`. The preflight validates environment names, origin syntax and known secret-key mistakes but does not actually contact Supabase.
- After creating a Vercel Preview, register its exact callback and password recovery URLs in Supabase Auth; verify end-to-end email confirmation and password reset. Never place `service_role` or `sb_secret_` in a `NEXT_PUBLIC_` variable.
- Admin project, delivery and extension `datetime-local` fields explicitly mean IST (+05:30). Real timestamps are stored as UTC. Avoid reinterpreting them in a deployment's server timezone.
- The project search preserves existing RLS and returns exact totals; Admin application/review searches query the whole authorized database with separate pages. Other Admin queues still paginate in groups of 50.
