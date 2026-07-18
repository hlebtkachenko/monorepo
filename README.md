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

## Repository Map

| Area                                                                                               | Purpose                                               |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [`apps/`](apps/)                                                                                   | Deployable web, admin, API, bot, CLI, and MCP apps    |
| [`packages/`](packages/)                                                                           | Domain code, shared libraries, and reusable tooling   |
| [`infra/`](infra/)                                                                                 | CDK, Cloudflare, containers, authorization, and ops   |
| [`docs/`](docs/)                                                                                   | Architecture decisions, runbooks, specs, and policies |
| [`scripts/`](scripts/)                                                                             | Repository automation and maintenance commands        |
| [`.github/`](.github/)                                                                             | CI workflows, templates, and community files          |
| [`.devcontainer/`](.devcontainer/)                                                                 | Containerized development environment                 |
| [`.vscode/`](.vscode/)                                                                             | Shared Cursor and VS Code workspace settings          |
| [`.agents/`](.agents/), [`.claude/`](.claude/), [`.codex/`](.codex/), [`.conductor/`](.conductor/) | Agent and workspace tool configuration                |

### Applications

| Path                       | Role                                     |
| -------------------------- | ---------------------------------------- |
| [`apps/web`](apps/web)     | Next.js customer application             |
| [`apps/admin`](apps/admin) | Next.js administration application       |
| [`apps/api`](apps/api)     | NestJS public API                        |
| [`apps/mcp`](apps/mcp)     | Public API MCP server and Brain bridge   |
| [`apps/cli`](apps/cli)     | Public API and Brain command-line client |
| [`apps/bot`](apps/bot)     | Telegram development control plane       |

### Package Groups

| Group           | Packages                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounting      | [`accounting`](packages/accounting), [`accounting-kb`](packages/accounting-kb), [`brain`](packages/brain), [`intake`](packages/intake), [`registries`](packages/registries)                                                         |
| Platform        | [`auth`](packages/auth), [`db`](packages/db), [`storage`](packages/storage), [`workers`](packages/workers), [`org-provisioning`](packages/org-provisioning), [`observability`](packages/observability), [`notify`](packages/notify) |
| Product         | [`ui`](packages/ui), [`email`](packages/email), [`i18n`](packages/i18n)                                                                                                                                                             |
| Developer tools | [`sdk`](packages/sdk), [`shared`](packages/shared), [`config`](packages/config), [`eslint-config`](packages/eslint-config), [`typescript-config`](packages/typescript-config), [`testcontainers`](packages/testcontainers)          |

Root manifests and dotfiles remain at repository root because Git, Docker,
pnpm, Turborepo, editors, and agent tools discover them there. Cursor and VS
Code collapse related root files through [`.vscode/settings.json`](.vscode/settings.json).

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

| Command                                  | Description                    |
| ---------------------------------------- | ------------------------------ |
| `pnpm dev`                               | Start Next.js dev server       |
| `pnpm build`                             | Build all packages and apps    |
| `pnpm test`                              | Run all tests via Turborepo    |
| `pnpm lint`                              | Lint all packages              |
| `pnpm typecheck`                         | Type-check all packages        |
| `pnpm format`                            | Format all files with Prettier |
| `pnpm --filter @workspace/ui storybook`  | Start Storybook on port 6006   |
| `pnpm --filter @workspace/ui test:watch` | Watch mode for UI tests        |

## Adding Components

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components are placed in `packages/ui/src/components/`. After adding, create the folder structure with `index.ts`, stories, and tests.

## Using Components

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Full Stack Quick Start

```bash
pnpm install
scripts/generate-env.sh                              # generate apps/web/.env.local with random local-dev secrets
docker compose -f infra/compose/docker-compose.dev.yml up -d
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed
pnpm dev                                             # all services
```

Local-dev secrets are generated by `scripts/generate-env.sh`; production secrets live in Vault → AWS SSM SecureString (see [`docs/conventions/SECRETS-AND-VARIABLES.md`](docs/conventions/SECRETS-AND-VARIABLES.md)). SOPS+age was evaluated for shared dev secrets but never adopted.

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

## Releases

Tags are strict semver with a `v` prefix:

| Kind              | Format                            | Example       |
| ----------------- | --------------------------------- | ------------- |
| Stable release    | `v<MAJOR>.<MINOR>.<PATCH>`        | `v0.9.0`      |
| Release candidate | `v<MAJOR>.<MINOR>.<PATCH>-rc.<N>` | `v0.9.1-rc.1` |

Bump rules, the cut workflow, and the tag → deploy order live in
[`docs/conventions/RELEASES.md`](docs/conventions/RELEASES.md).

## Documentation

- [`AGENTS.md`](AGENTS.md): project rules for AI agents and contributors
- [`ARCHITECTURE.md`](ARCHITECTURE.md): system architecture overview
- [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md): workflow and contribution rules
- [`.github/SECURITY.md`](.github/SECURITY.md): vulnerability reporting and security posture
- [`.github/CODE_OF_CONDUCT.md`](.github/CODE_OF_CONDUCT.md): community standards
- [`CHANGELOG.md`](CHANGELOG.md): release notes
- [`docs/conventions/RELEASES.md`](docs/conventions/RELEASES.md): version tag format + release cut workflow
- [`docs/adr/`](docs/adr/): architecture decision records
- [`docs/brain/README.md`](docs/brain/README.md): Afframe Brain overview and safety model; see [`docs/brain/TECHNICAL.md`](docs/brain/TECHNICAL.md) for internals and GitHub epic [#524](https://github.com/hlebtkachenko/monorepo/issues/524) for delivery status
