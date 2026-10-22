# Next development priorities — after Phase 2 code increments

1. **Dedicated Supabase**: Confirm the intended organization and any quoted cost before creating a separate Creator Collaboration project. Do NOT reuse Instagram DM Production, Open Chet or any unrelated project. Apply all three SQL migrations in order, verify Auth/Storage roles, RLS, legacy dispatcher revocation and Supabase security advisors.
2. **Hosted business E2E**: With isolated test accounts (1 Admin + 2 Creators), test approval and immutable terms, product dispatch/delivery, audio/video upload and signed playback, revision limit, deadline extensions, retry/recovery, and manual payment references. Never create a real PAID record without an authorized transfer.
3. **Mobile acceptance**: Test authenticated creator/admin flows in Android Chrome on a real device and on desktop; verify responsive forms, media playback, long filenames and network interruptions. Public-page Chromium tests are not a substitute.
4. **Old Storage orphans**: Provide an Admin-reviewed, time-bounded abandoned-upload cleanup job. Never delete referenced media, and delete bytes through Storage API rather than SQL.
5. **Reliability/performance**: Add true upload byte-progress and resumable large upload support where needed, stable totals for paginated history, and fuller filtering/export.
6. **Security/dependencies**: Investigate npm high-severity advisories, adopt non-breaking fixes with new lockfile and tests, review all RLS grants and third-party license/usage.
7. **Preview deployment**: Only after hosted backend setup, configure Vercel environment variables, allowed Auth callback origins and secure preview testing. Production approval belongs to the project owner.

The app remains an intentionally small one-Admin/one-Creator MVP. Automated payments are out of scope; PAID is manual after a real transfer.
