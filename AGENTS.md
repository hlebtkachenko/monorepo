# Agent Instructions

Instructions for AI agents (Claude Code, Codex, Cursor) working in this monorepo.

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **UI package** (`packages/ui`): 55 shadcn/ui components, consumed source-first (no build step)
- **Web app** (`apps/web`): Next.js 16 with Turbopack
- **Shared configs**: `packages/eslint-config` (flat config), `packages/typescript-config`

## Component Pattern

Every component lives in `packages/ui/src/components/{name}/` with 4 files:

```
{name}.tsx          # component implementation
index.ts            # re-exports (export * from "./{name}")
{name}.stories.tsx  # Storybook CSF story
{name}.test.tsx     # Vitest + React Testing Library test
```

## Import Rules

- Components: `import { Button } from "@workspace/ui/components/button"`
- Utilities: `import { cn } from "@workspace/ui/lib/utils"`
- Hooks: `import { useIsMobile } from "@workspace/ui/hooks/use-mobile"`
- Never use `@/components/ui/` (wrong path for monorepo)

## Before Importing a Component

READ the source file first. Never guess exports. The export list is at the bottom of each component file.

## Verification After Changes

1. `pnpm typecheck` must pass
2. `pnpm test` must pass (144 tests)
3. `pnpm build` must pass
4. For UI changes: start dev server and check visually

## Runbooks

Agent-specific runbooks live in `docs/runbooks/`:
- `SHOWCASE-RUNBOOK.md`: instructions for adding component demos to the showcase page

## Code Standards

- TypeScript 6+ (always latest)
- No unnecessary comments
- No premature abstractions
- Validate at system boundaries only
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`

## Testing

- Framework: Vitest + jsdom + @testing-library/react
- Config: `packages/ui/vitest.config.ts`
- Setup file mocks: ResizeObserver, IntersectionObserver, matchMedia, scrollIntoView, hasPointerCapture
- Run: `pnpm test` (all) or `pnpm --filter @workspace/ui test:watch` (watch mode)

## Storybook

- Framework: Storybook 10 + Vite
- Config: `packages/ui/.storybook/`
- Run: `pnpm --filter @workspace/ui storybook`
- Stories use CSF format with Meta + StoryObj pattern
