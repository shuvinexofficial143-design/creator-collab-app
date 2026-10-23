# Private single-creator workflow (experimental branch)

This branch is a small, invitation-only Creator Collaboration app for **one business owner (ADMIN)** and **one invited creator (CREATOR)**. It is not deployed or connected to a dedicated hosted backend yet.

## 1. Auth and access

The UI has a **Username + Password** sign-in. Public registration, email/forgot/reset UI and mass creator onboarding are intentionally absent.

It still uses **Supabase Auth** securely under the hood (pre-provisioned email/password accounts), and preserves existing RLS, server-side profile checks and session cookies. Do NOT create a plaintext hardcoded password or commit credentials.

1. Create a **dedicated** Creator Collab Supabase project after confirming account, cost and ownership. Never use NEXORA, YASHIKA, Open-Chet, or other unrelated databases.
2. Apply the seven existing SQL migrations in filename order, and validate RLS/security advisors. No new migration is needed for the frontend simplification.
3. Via Supabase Dashboard Auth > Users, provision **exactly two** confirmed accounts: Admin and one Creator. Assign long unique passwords **within Supabase Auth**; do not store them in environment variables or GitHub.
4. Promote only the verified Admin user's UUID using the trusted SQL bootstrap described in `docs/SETUP.md`. The Creator remains CREATOR.
5. Disable public signup in the Supabase project's Auth settings. UI-only signup removal is not a security boundary.
6. Set these server-only variables in Vercel Preview:

```
ADMIN_LOGIN_USERNAME=
ADMIN_AUTH_EMAIL=
CREATOR_LOGIN_USERNAME=
CREATOR_AUTH_EMAIL=
```

Usernames are 3–32 characters, beginning with a letter; lowercase letters, digits, underscores, periods and hyphens are allowed. Both usernames must be distinct. Emails are looked up **on the server only**. The actual password is the password already set in Supabase Auth. Avoid short/reused passwords; use Supabase Auth rate limits.

Do not put `ADMIN_AUTH_EMAIL` or `CREATOR_AUTH_EMAIL` under `NEXT_PUBLIC_`.

## 2. Business workflow

- Admin: create Product or Voice projects, attach a private script and public/unlisted **YouTube reference URL**, approve the application, record dispatch, review submitted media and request revisions.
- Creator: sign in with assigned username, browse, apply, record and submit work.
- **No payout UI**: the Earnings page and payment Admin controls are hidden/disabled. Owner arranges all real compensation privately. Historic payment SQL tables remain for compatibility; new project forms provide a hidden numeric 0 because the schema expects this field. Existing financial records are not erased.
- Account capacity defaults to one Creator; operational tracking and approval remain available for the owner.

## 3. YouTube references

Paste a `https://youtube.com/watch?v=...` or `https://youtu.be/...` URL in the project's **YouTube reference video URL** field. The project page renders a privacy-enhanced YouTube embed. The app saves a reference link, **not copies of the YouTube video**.

Public/unlisted videos may still be viewable by anyone who gets the link. Video owners can disable embedding, so the original link is retained as a fallback. Do not use private YouTube videos that cannot be embedded.

## 4. Telegram owner delivery

Create a Telegram bot through the official **@BotFather**, obtain its token privately, send `/start` to the bot from the owner's Telegram, and identify the intended private chat ID.

Set **server-only** Vercel Preview environment variables:

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

NEVER put either in public GitHub files, `NEXT_PUBLIC_` variables, browser source, screenshots or user-visible replies.

After a Creator submits and Supabase confirms the private object is linked, the browser calls the secured `/api/owner-delivery` route. This route verifies Supabase user, active Creator profile, and ownership of the submission before using a server-side Bot token and fixed owner chat ID.

- Supported files up to **15 MiB** are relayed into Telegram as video/document where feasible.
- Larger files (up to the app's existing 100 MiB upload limit) are delivered as an **expiring private signed download link** in the Telegram message. This is an intentional conservative relay limit, not Telegram's full Bot API limit.
- All uploaded media remain in **private Supabase Storage** as the authoritative copy. A Telegram or network failure must never delete or invalidate the Creator's submission. Admin can review it in the app.
- Owner notifications are **best effort, not exactly-once** and are not yet protected by a durable retry/outbox. Before live use, add queue/idempotency/retry tracking and verify hosted delivery with the real Bot.
- The Creator upload page explicitly says work is shared with the business owner through Telegram for review. Do not secretly relay private content without disclosure.

## 5. Deployment and verification

This is a separate development branch: `feature/private-single-creator`. Do not merge into `main` or switch the existing production site without approval. Use a **Vercel Preview** with Next.js preset, no custom output directory, and the dedicated Supabase credentials.

Run:
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Authenticated Admin/Creator real browser tests against the dedicated backend
- Small MP4/audio Telegram delivery and >15 MiB private-link fallback tests
- RLS, creator isolation and upload retry tests

Tests from CI without the live backend are **not live Auth, Telegram or Storage acceptance**. Review Chrome/Safe Browsing warnings before entering any personal passwords in the Preview.

## Remaining blockers

- Dedicated Supabase project and the seven migrations have **not** been applied here.
- No usernames, passwords, bot credentials or chat IDs have been configured.
- No real authenticated upload or Telegram delivery has been verified.
- Existing Production Vercel site is untouched.
