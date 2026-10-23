# Phase 5 — next actionable milestones

1. **Owner approval for dedicated Supabase:** Select the intended connected organization. Verify its project creation price using the connected billing tool; get explicit approval for any nonzero quote. Do not provision into NEXORA, YASHIKA, Open-Chet or another application's database.
2. **Hosted initialization:** Create a new Creator Collab project once approved. Apply all **seven** SQL migrations in filename order. Inspect migration history, RLS policies, function EXECUTE grants, Storage buckets, Auth callback/email configuration and Supabase Security Advisors. Configure the publishable key privately and do not commit `.env.local`.
3. **Real account E2E:** Bootstrap the real Admin with a verified user ID through trusted SQL, configure one invited Creator and a separate isolated test Creator, then verify registration, confirmation, login, logout, reset, session refresh, suspension and private record isolation. Use only disposable labeled test data.
4. **Real business E2E:** Test Product and Voice workflows from Admin creation through application, approval, optional shipping, real browser TUS upload, revision, approval and PENDING earnings. Mark PAID only with an actual authorized external transfer.
5. **Storage resilience:** Verify signed URLs, upload retries, partial upload resume, browser refresh, recovery, concurrent cleanup claims, lease expiry and refusal to delete referenced files on actual hosted Supabase; isolated PostgreSQL tests already cover database invariants.
6. **Vercel Preview only:** Choose intended connected Vercel account, run `npm run preflight` against preview variables, configure Auth callbacks and test an actual accessible preview URL. Require separate explicit owner approval for production.
7. **Mobile real device:** In addition to successful Chromium Pixel 7 emulation, test actual Android Chrome login, file selection/large upload, long projects, audio/video playback, earnings and Admin forms.
8. **Security remaining:** Recheck `braces` patch status, run Supabase Security Advisors and authenticated HTTP 401/403/Storage tests on the isolated backend. Treat `npm audit --omit=dev` success as only one part of the supply-chain review.

The app remains a small paid product-video and voice-over collaboration system, not an automated commission marketplace.
