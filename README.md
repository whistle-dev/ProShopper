# Proshopper

Single-user deal monitor and assisted buyer for Proshop, with a TypeScript monorepo split into:

- `apps/web`: Next.js dashboard and API routes
- `apps/worker`: BullMQ worker for polling, notifications, and purchase preparation
- `packages/core`: shared domain types, Proshop adapter, analysis, and database schema

## Quick start

1. Install dependencies: `pnpm install`
2. Copy environment variables from `.env.example`
3. Push the schema: `pnpm db:push`
4. Start the dashboard: `pnpm dev:web`
5. Start the worker: `pnpm dev:worker`

## Important defaults

- The system is single-user by design in v1.
- Proshop is the only implemented retailer, but the adapter contract is multi-site-ready.
- Demo effective-price verification and purchase preparation use isolated Playwright sessions.
- Live order submission is disabled by default unless `ALLOW_LIVE_ORDER_SUBMIT=true`.
