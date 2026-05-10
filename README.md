# Monorepo

Next.js + shadcn/ui monorepo with Turborepo, pnpm workspaces, Storybook, and Vitest.

## Prerequisites

- Node.js >= 20
- pnpm 9.x (`corepack enable`)

## Getting Started

```bash
pnpm install
pnpm dev          # Next.js dev server (port 3000)
```

## Project Structure

```
apps/
  web/              # Next.js 16 app (Turbopack)
packages/
  ui/               # shadcn/ui component library (55 components)
  eslint-config/    # shared ESLint flat configs
  typescript-config/ # shared tsconfig presets
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

## Stack

- Next.js 16 + Turbopack
- React 19
- Tailwind CSS v4
- shadcn/ui + Radix UI
- TypeScript 6
- Turborepo
- pnpm workspaces
- Storybook 10
- Vitest 4 + React Testing Library
