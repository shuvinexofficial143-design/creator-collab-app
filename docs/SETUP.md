# Setup

1. Use a dedicated Supabase project. None of the connected projects were identified as belonging to this app, so none were modified.
2. Run the SQL in `supabase/migrations/20261022060834_creator_workflow.sql` in a new project's SQL editor, or apply with the installed Supabase CLI after following its `--help` and linking the correct project. The migration creates the private submissions bucket and policies. Never apply to an unrelated production project.
3. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. No service-role key is required by this application.
4. Set APP_URL to the exact origin, e.g. http://localhost:3000 locally, and configure Supabase Auth Site URL and allowed redirect URLs including `/auth/callback` and `/auth/callback?next=/auth/reset`. Enable email confirmation and configure production SMTP.
5. Register the owner using the app and confirm their email. In the trusted Supabase SQL editor, promote only the verified owner's user UUID: `update public.profiles set role = 'ADMIN' where id = '<verified-owner-user-uuid>';`. Do not use user_metadata or browser-controlled role settings. There is no public admin password.
6. Run npm run dev. The Admin panel creates briefs, approves applications, dispatches products, reviews work and records payments. Use a separate creator account for the full workflow.
7. Vercel: import the repository, select the feature branch for a preview, use Next.js defaults, configure the above variables, and configure the exact preview/production callback origins in Supabase. Deployment has not been performed.

## Operational notes

- Payment amounts are stored as integer paise. Manual transfers happen outside this application; PAID requires a transaction reference.
- Project deadlines in the Admin form use UTC. Detail screens display IST. Shipping addresses are private.
- Uploads: private bucket; audio MP3/WAV/M4A/OGG, video MP4/WebM; maximum 100 MiB. MIME metadata is not malware inspection. Do not render uploads as HTML. Failed post-upload submissions can leave orphan files; maintenance cleanup is pending.
- Configure Supabase Auth rate limits/CAPTCHA before broad public signup. This app is intended for a small invited team.
- Review database security advisors in the actual project before launch. The private SECURITY DEFINER dispatcher deliberately centralizes transactions and validates actor/ownership on every operation. Its public wrapper is SECURITY INVOKER and anon has no EXECUTE grant.
- Bootstrap and account recovery actions should be performed only by the project owner. Never commit .env.local.
