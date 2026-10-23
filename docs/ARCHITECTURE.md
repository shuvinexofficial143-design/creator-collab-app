# Architecture

Next.js App Router, TypeScript, Supabase SSR cookie authentication, PostgreSQL RLS, private Storage, Zod input validation, Lucide icons and responsive CSS. Tailwind and React Hook Form were not required for the current server-action forms.

Server components call getUser and load active profiles. Admin pages and actions enforce ADMIN on the server. The database independently enforces active accounts and roles. No service-role client bypasses RLS.

Tables: profiles, projects, project_scripts, project_media, applications, assignments, shipping, submissions, payments, notifications, audit_logs. Product and voice briefs share projects; scripts have separate RLS so browsing creators cannot read them. Projects carry structured brief details, and project_media records private product/reference uploads. A standalone reusable product catalog is not implemented; products are currently project-scoped.

Mutations go through public.workflow (SECURITY INVOKER) into a private, fixed-search-path SECURITY DEFINER function. Direct table writes are revoked for authenticated users. The dispatcher obtains auth.uid(), checks active status and role/ownership, and locks affected rows before transitions. Approving an application snapshots payment, brief details and a private script into an assignment; approving work creates a unique payable. Paid rows cannot be completed again. Every submission version is retained as a separate submission row with its review feedback.

Phase 2 freezes accepted terms after an assignment, enforces recorded delivery deadlines and revision caps at the database boundary, and permits audited Admin extensions. The newly added migration revokes direct caller access to the renamed legacy dispatchers to prevent bypassing these rules. Legacy assignments cannot accurately reconstruct original agreement snapshots.

Shipping is independent of application status: ADDRESS_REQUIRED → READY → DISPATCHED → DELIVERED. Assignment: ACTIVE → SUBMITTED → REVISION → SUBMITTED → APPROVED. Payable: PENDING → PROCESSING → PAID (or PENDING → PAID).

Storage objects use creator UUID / assignment UUID / random UUID. Bucket constraints restrict size and MIME types; policies check assignment ownership and editable status for inserts. Existing objects cannot be overwritten by creators. Signed read URLs last five minutes. Phase 2 client finalization checks whether a media path is linked before retrying the workflow RPC or using the Storage API to remove an unlinked file. Database Storage RLS denies deletion of referenced media. Abandoned sessions may still leave old objects for future administrative cleanup.

The operations UI paginates Admin history (25 rows per section) and Creator submission history (10 rows per assignment); the Admin panel also searches pending application and submission text.

The SQL integration test uses PGlite PostgreSQL with small auth/storage schema fixtures, real migration SQL, real RLS and role switching. This tests database behavior, not hosted Auth, Storage HTTP or email delivery.

## Phase 4 reporting API

`workspace_metrics()` is a SECURITY INVOKER Postgres function with a fixed search path and active-profile guard. It aggregates payments and counts within existing RLS policies, eliminating PostgREST's default 1,000-response-row limit without exposing another Creator's data. The function is callable only by `authenticated` and rejects inactive users.

`GET /api/admin/export` validates the Supabase user and active ADMIN profile on the server, resolves only a static dataset/column allow-list, counts rows exactly and refuses any export above 5,000 records. It iterates small read batches, validates row shapes and returns a non-cacheable CSV attachment with spreadsheet formula-cell protection. The API never uses a service-role token. Hosted authorization testing remains pending.

Admin queue lists now use 50-row server-side pages across applications, submissions, outstanding payments, creators, dispatch-ready shipping and delivery deadlines. Counts are obtained independently of those pages. Current keyword search is limited to the loaded queue page and is labelled accordingly; full database search remains pending.

## Phase 5 query and time boundaries
- `admin_find_pending()` is an active-Admin-only SECURITY INVOKER SQL RPC for pending applications and reviews. It performs database-wide literal case-insensitive search over project, note and Creator-name fields and returns exact counts and bounded results. Each queue paginates independently of the other operational queues.
- `find_projects()` is an RLS-preserving SECURITY INVOKER SQL RPC for catalog title/description/language search, type/status filtering and bounded pages. The role's existing `public.projects` RLS determines which projects are visible.
- All browser `datetime-local` business deadline controls are explicitly IST and converted to UTC during Server Actions; saved timestamps are reverse formatted in IST to prevent server timezone drift.
- Vercel preview uses `npm run preflight` to catch obviously unsafe variable configuration. This is purely local/static, not a live Supabase connection test.
