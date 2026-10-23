# Creator Collaboration — Security Audit (Phase 5 update, 2026-10-23)

## Phase 5 security review
- `admin_find_pending()` verifies an active Admin, executes as SECURITY INVOKER, validates queue/page/length, searches user text as literal substrings and returns only 25-row pages. A disposable PostgreSQL test verifies rejection of Creator/anonymous/inactive Admin access and 65+ record paging.
- `find_projects()` is SECURITY INVOKER and obeys existing project RLS. Admin-only statuses and draft visibility are guarded at the database level. A 1,001-project simulation tests exact counts and Creator draft denial.
- Deadline form values are now explicitly parsed as IST (+05:30), validated and persisted as UTC; no data migration was applied to prior rows.
- Read-only `npm run preflight` rejects missing preview origins, malformed URLs and obvious service-role/secret key leaks without disclosing the supplied key.
- Latest npm advisory evidence (2026-10-23) still shows [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affecting `braces <=3.0.3` with no patched release. Continue monitoring; do not invent a forced fix or suppress warnings.
- **Hosted security remains untested**: Supabase Advisors, real Storage access and signed URL expiry, authenticated Admin/Creator E2E, third-party content inspection, 401/403 against deployed endpoints and Android device privacy.

## Prior security audit (Phase 4)

## Trust boundary review (source-level)
- **Authentication**: Supabase SSR `getUser()` is checked server-side; `account(true)` verifies active ADMIN for protected pages/actions. API export separately returns 401 unauthenticated, 403 non-Admin, and fails closed if a profile cannot be verified. No service-role client is shipped.
- **Creator rows**: SQL RLS protects assignments, applications, private scripts, shipping details, payments, notifications and related Storage access. Public write operations remain constrained to authorized workflow RPCs. Phase 3 uses registered upload sessions, leases, advisory locks and an explicit ADMIN-only cleanup claim.
- **Totals**: `workspace_metrics()` runs as SECURITY INVOKER, not DEFINER. Postgres RLS limits every aggregate to authorized records. The PGlite test creates 1,001 disposable simulated records, verifies owner/admin totals, cross-Creator isolation, inactive-user denial and anonymous denial.
- **CSV**: Server checks the signed-in user's ADMIN role before querying. Dataset, columns and order are constants (not request-supplied SQL). The API counts rows, enforces a 5,000-row ceiling, verifies complete reads, escapes quotes/newlines and prefixes formula-like values with an apostrophe even when preceded by whitespace/directional control characters. Private/cache-disabled CSV response and attachment disposition. Shipping address is not exported. Production authorization/desktop spreadsheet tests are still pending. Public HTTP and Chromium checks confirm the route fails closed (503/no-store) when no Supabase backend is configured.
- **Uploads**: Signed short-lived read links, type/MIME validation and private buckets; Admin cleanup claims require age/lease/ref revalidation and remove bytes through the Storage API. No scheduled auto-delete. MIME sniffing is not an antivirus scan.
- **Payments**: PAID requires an Admin-recorded actual transaction reference; database test fixtures use clearly simulated entries, and no hosted money transfers occur.

## npm dependency findings
- Lockfile contains `@next/eslint-plugin-next@16.4.2` (dev only) → `fast-glob@3.3.1` (dev) → `micromatch@4.0.8` (dev) → `braces@3.0.3` (dev).
- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) / CVE-2026-93687: high-severity uncontrolled recursion/stack exhaustion. On 2026-10-22 the reviewed advisory lists versions <=3.0.3 as affected with **no patched release**. `npm ci` can show five high findings for the dependency chain; this is not a claim of five independent patched vulnerabilities.
- The current lockfile categorizes the chain as dev-only, but full runtime bundle reachability has not been independently proven. The CI gate `npm audit --omit=dev --audit-level=high` now tests production dependencies without suppressing advisories. Build tools should never receive attacker-controlled glob expressions.
- Do not apply `npm audit fix --force` or a nonexistent `braces@3.0.4` override merely to silence the warning. Revisit when upstream publishes a fix and rerun lockfile/regression tests.

## Outstanding high-priority acceptance checks
1. Dedicated hosted Supabase Auth callback, SMTP/email confirmation and account recovery.
2. Cross-tenant RLS and private signed-URL access with real signed-in browsers, independent creators and suspended accounts.
3. Storage TUS resume, claim-versus-attachment race, service cleanup failures, timeout/retry and authenticated media playback against actual Supabase HTTP APIs.
4. Admin CSV HTTP status checks, no-cache download, spreadsheet formula testing and exports near 5,000 records against hosted test data.
5. Mobile/Android logged-in UI and file transfers. Current CI browser tests are viewport emulation, not real-device tests.
6. Vercel preview only after the backend and environment variables are configured. Production deployment and any new paid infrastructure need owner approval.

## Build and local-cache report
GitHub CI fresh-checkout production builds passed for the tested source. The Astra screenshot mentioned a Turbopack cache-related local failure; no original stack trace, cache or machine access is available in this session, so the root cause is UNVERIFIED. Do not present clearing `.next` as a proven fix. Obtain original logs and reproduce against the same code before choosing a local mitigation.
