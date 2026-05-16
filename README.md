# Monorepo

Next.js + shadcn/ui monorepo with Turborepo, pnpm workspaces, Storybook, and Vitest.

## Prerequisites

- Node.js >= 22
- pnpm 11.x (`corepack enable`)

## Getting Started

```bash
pnpm install
pnpm dev          # Next.js dev server (port 3000)
```

## Project Structure

```
apps/
  web/              # Next.js 16 app (Turbopack)
  admin/            # admin app
  api/              # NestJS backend API
packages/
  ui/               # shadcn/ui component library (105 components)
  auth/             # Better Auth + session binding + RLS GUC
  config/           # shared configuration
  db/               # Drizzle schema + RLS + migrations
  email/            # React Email templates + transport
  eslint-config/    # shared ESLint flat configs
  i18n/             # internationalization
  observability/    # pino + OpenTelemetry helpers
  pdf/              # PDF/A-3 generation + QR Platba
  shared/           # shared utilities, Zod schemas
  storage/          # org-scoped storage
  testcontainers/   # integration test containers
  typescript-config/ # shared tsconfig presets
  workers/          # pg-boss background job handlers
docs/
  runbooks/         # agent instruction documents
```

## Component Structure

Each component follows the folder-per-component pattern:

```
packages/ui/src/components/button/
  button.tsx          # component source
  index.ts            # re-exports
  button.stories.tsx  # Storybook story
  button.test.tsx     # Vitest test
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests via Turborepo |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm format` | Format all files with Prettier |
| `pnpm --filter @workspace/ui storybook` | Start Storybook on port 6006 |
| `pnpm --filter @workspace/ui test:watch` | Watch mode for UI tests |

## Adding Components

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components are placed in `packages/ui/src/components/`. After adding, create the folder structure with `index.ts`, stories, and tests.

## Using Components

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Full Stack Quick Start (TBA)

Once backend packages are implemented:

```bash
pnpm install
pnpm bootstrap:env                                   # hydrate .env from infra/env.example + SOPS
docker compose -f infra/compose/docker-compose.dev.yml up -d
pnpm --filter @workspace/db migrate
pnpm seed:dev
pnpm dev                                             # all services
```

Requires `sops` on PATH and age private key at `~/.config/sops/age/keys.txt`.

## Stack

- Next.js 16 + Turbopack
- NestJS API (separate backend)
- React 19
- Tailwind CSS v4
- shadcn/ui + Radix UI
- TypeScript 6
- PostgreSQL 18 + Drizzle ORM (FORCE RLS)
- Better Auth + Drizzle adapter
- Anthropic TypeScript SDK direct
- pg-boss background jobs (7 lanes)
- Turborepo + pnpm workspaces
- Storybook 10
- Vitest 4 + Playwright + React Testing Library
- pino + OpenTelemetry
- AWS (ECS Fargate + RDS + S3)

## Documentation

- [`AGENTS.md`](AGENTS.md): project rules for AI agents and contributors
- [`ARCHITECTURE.md`](ARCHITECTURE.md): system architecture overview
- [`CONTRIBUTING.md`](CONTRIBUTING.md): workflow and contribution rules
- [`CHANGELOG.md`](CHANGELOG.md): release notes
- [`docs/adr/`](docs/adr/): architecture decision records
