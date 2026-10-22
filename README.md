# Creator Collaboration

Private-business workspace for product video and voice over collaborations.

## Development

Requires Node.js 22+ and npm. Run `npm ci`, copy `.env.example` to `.env.local`, configure a dedicated Supabase project, then `npm run dev`. Without configuration, protected screens show the setup page. No fake activity is populated.

- `npm run typecheck` — TypeScript
- `npm run lint` — ESLint
- `npm test` — validation and embedded PostgreSQL integration tests
- `npm run build` — production build

Read [Setup](docs/SETUP.md), [Architecture](docs/ARCHITECTURE.md), [Development status](docs/DEVELOPMENT_STATUS.md) and [Next steps](docs/NEXT_STEPS.md) before running migrations or deploying. This is an in-development MVP; live Auth/Storage and browser acceptance tests are still required.
