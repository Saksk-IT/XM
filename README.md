# XM

XM is a private, single-admin, multi-project management website for personal development projects.

## Stack

- React + Vite + TypeScript + Tailwind CSS
- Native WeChat Mini Program
- Fastify + Prisma
- PostgreSQL
- pnpm workspace

## Local Development

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

Open `http://localhost:5173` and log in with the values from `.env`.

Open the WeChat Mini Program project from `apps/miniprogram`. See `docs/miniprogram.md` for local/preview API profiles and AppSecret configuration.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e
```

## Production-like Docker

```bash
docker compose up --build
```

The API serves both `/api/*` and the built web app on `http://localhost:4000`.
