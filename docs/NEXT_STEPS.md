# Phase 4 next work (following recovered and committed functionality)

1. Verify latest GitHub branch HEAD and BOTH CI runs before further changes. Resolve any new validation failure before introducing more features.
2. Obtain explicit organization/cost confirmation for a **separate** Creator Collaboration Supabase project. Never reuse unrelated databases. Apply all five migrations in order on an authorized dedicated project.
3. Test hosted Supabase Auth, Admin bootstrap, email, RLS, scripts, private Storage, TUS interruption/resume, 30-minute leases, upload cleanup and Security Advisors with 1 Admin / 2 Creators. Check isolated actual browser flows and real Android hardware.
4. Improve Admin search to query all authorized records, not only the selected 50-row queue page; make filters independent of per-queue pagination as needed. Large CSV >5,000 records should be narrowed through safe filters rather than silently truncated.
5. Validate CSV downloads on Android/desktop and test actual status codes for unauthorized authenticated and anonymous users. Pure escaping tests and server authorization code alone are not a hosted security test.
6. Inspect and harden production deploy configuration, mobile navigation and request failures. Import a Vercel preview on feature branch ONLY after dedicated Supabase credentials are configured; require owner approval for production.
7. Monitor upstream `braces` security advisory for a patched version. Never blindly override to a nonexistent release or downgrade breaking Next.js dependencies. Audit production dependency closure continuously.
8. Investigate original local Turbopack cache report using actual error logs if the original workspace becomes available. Fresh CI build passing is not proof of what happened on that machine.

No automatic affiliate commissions, fake payment claims or automatic payouts are planned.
