# Architecture

Next.js App Router, TypeScript, Supabase SSR cookie authentication, PostgreSQL RLS, private Storage, Zod input validation, Lucide icons and responsive CSS. Tailwind and React Hook Form were not required for the current server-action forms.

Server components call getUser and load active profiles. Admin pages and actions enforce ADMIN on the server. The database independently enforces active accounts and roles. No service-role client bypasses RLS.

Tables: profiles, projects, project_scripts, project_media, applications, assignments, shipping, submissions, payments, notifications, audit_logs. Product and voice briefs share projects; scripts have separate RLS so browsing creators cannot read them. Projects carry structured brief details, and project_media records private product/reference uploads. A standalone reusable product catalog is not implemented; products are currently project-scoped.

Mutations go through public.workflow (SECURITY INVOKER) into a private, fixed-search-path SECURITY DEFINER function. Direct table writes are revoked for authenticated users. The dispatcher obtains auth.uid(), checks active status and role/ownership, and locks affected rows before transitions. Approving an application snapshots payment into an assignment; approving work creates a unique payable. Paid rows cannot be completed again. Every submission version is retained as a separate submission row with its review feedback.

Shipping is independent of application status: ADDRESS_REQUIRED → READY → DISPATCHED → DELIVERED. Assignment: ACTIVE → SUBMITTED → REVISION → SUBMITTED → APPROVED. Payable: PENDING → PROCESSING → PAID (or PENDING → PAID).

Storage objects use creator UUID / assignment UUID / random UUID. Bucket constraints restrict size and MIME types; policies check assignment ownership and editable status for inserts. Existing objects cannot be overwritten by creators. Signed read URLs last five minutes. Upload failure can leave an unreferenced object; retention/cleanup is not implemented.

The SQL integration test uses PGlite PostgreSQL with small auth/storage schema fixtures, real migration SQL, real RLS and role switching. This tests database behavior, not hosted Auth, Storage HTTP or email delivery.
