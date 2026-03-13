# Proshopper

Single-user deal monitor and assisted buyer for Proshop, with a TypeScript monorepo split into:

- `apps/web`: Next.js dashboard and API routes
- `apps/worker`: BullMQ worker for polling, notifications, and purchase preparation
- `packages/core`: shared domain types, Proshop adapter, analysis, and database schema

## Quick start

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env`
3. Start Postgres and Redis with Docker: `pnpm infra:up`
4. Push the schema: `pnpm db:push`
5. Start the dashboard and worker together: `pnpm dev`

If you want the full first-time setup in one flow after `.env` exists:

```bash
pnpm setup:local
pnpm dev
```

## Docker services

The repository ships with `docker-compose.yml` for local infrastructure:

- PostgreSQL 16 on `localhost:5432`
- Redis 7 on `localhost:6379`

Useful commands:

- `pnpm infra:up`: start Postgres and Redis and wait for health checks
- `pnpm infra:down`: stop containers
- `pnpm infra:logs`: tail service logs
- `pnpm infra:reset`: delete containers and volumes for a clean reset

## Connect your Proshop account

After the dashboard is running, upload an encrypted Proshop browser session with:

```bash
PROSHOP_CONNECT_URL=http://localhost:3000/api/retailer-accounts/proshop/connect \
CONNECT_API_TOKEN=replace-me \
SESSION_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
pnpm bootstrap:session
```

That opens a browser, lets you log in manually, then uploads the encrypted session to the app.

## Important defaults

- The system is single-user by design in v1.
- Proshop is the only implemented retailer, but the adapter contract is multi-site-ready.
- Demo effective-price verification and purchase preparation use isolated Playwright sessions.
- Live order submission is disabled by default unless `ALLOW_LIVE_ORDER_SUBMIT=true`.
