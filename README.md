# Creator Collaboration

Private-business workspace for product video and voice over collaborations.

## Development

Requires Node.js 22+ and npm. Run `npm ci`, copy `.env.example` to `.env.local`, configure a dedicated Supabase project, then `npm run dev`. Without configuration, protected screens show the setup page. No fake activity is populated.

- `npm run typecheck` — TypeScript
- `npm run lint` — ESLint
- `npm test` — validation and embedded PostgreSQL integration tests
- `npm run build` — production build

Read [Setup](docs/SETUP.md), [Architecture](docs/ARCHITECTURE.md), [Development status](docs/DEVELOPMENT_STATUS.md) and [Next steps](docs/NEXT_STEPS.md) before running migrations or deploying. This is an in-development MVP; live Auth/Storage and browser acceptance tests are still required. Phase 4 adds database-side RLS totals, bounded Admin CSV exports and isolated Product/Voice workflow tests. Review [Security Audit](docs/SECURITY_AUDIT.md) before launch.

## Phase 5

Admin-wide pending searches, project discovery, IST deadline handling and Android-emulated auth browser tests are implemented on the feature branch. The connected infrastructure does **not** yet include an authorized dedicated Creator Collab Supabase project, so this app is not ready for production use. After creating one with owner approval, apply all seven ordered SQL migrations and run `npm run preflight` before Vercel Preview testing. Never commit private environment keys.

## Private single-creator pilot

The development branch `feature/private-single-creator` provides invitation-only username/password access (two accounts: one Admin and one Creator), YouTube reference embeds, no in-app payment management, and server-side Telegram owner delivery after a private submission is saved. See [Private Creator Setup](docs/PRIVATE_CREATOR_SETUP.md). This feature is not live or production-verified; configure a dedicated Supabase backend and private Telegram credentials before acceptance testing.
