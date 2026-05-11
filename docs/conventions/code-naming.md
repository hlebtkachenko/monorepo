# Code naming

Naming rules for files, identifiers, imports, and exports across the monorepo. Lint enforces what it can; review covers the rest.

## Files

| Kind | Pattern | Example |
|---|---|---|
| TypeScript module | `kebab-case.ts` | `audit-log.ts` |
| TypeScript test | `kebab-case.test.ts` | `audit-log.test.ts` |
| TypeScript spec/integration | `kebab-case.integration.test.ts` | `auth-flow.integration.test.ts` |
| React component (single export) | `PascalCase.tsx` (in app feature dirs) OR `kebab-case.tsx` (in `packages/ui`) | `UserAvatar.tsx` / `user-avatar.tsx` |
| Storybook story | `kebab-case.stories.tsx` | `button.stories.tsx` |
| Type-only module | `kebab-case.types.ts` | `user.types.ts` |
| Bash script | `kebab-case.sh` | `safe-pull.sh` |
| Node script | `kebab-case.mjs` | `check-client-secrets.mjs` |
| Config | `<tool>.config.ts` or `<tool>.config.mjs` | `vitest.config.ts` |

Rationale: kebab-case is the safe default cross-platform; PascalCase reserved for single-export React components in app code. `packages/ui` uses kebab-case throughout for shadcn parity.

## Directories

`kebab-case`. Single-word when possible. Group by domain (feature) at app level, by primitive type at package level.

## TypeScript identifiers

| Kind | Convention | Example |
|---|---|---|
| Variable, function | `camelCase` | `getUser`, `parseAmount` |
| React component | `PascalCase` | `UserAvatar` |
| React hook | `camelCase` starting `use` | `useUserSession` |
| Type, interface, class | `PascalCase` | `UserSession`, `Repository` |
| Constant (module-level immutable) | `SCREAMING_SNAKE_CASE` | `MAX_RETRIES` |
| Enum member | `PascalCase` | `OrderStatus.Pending` |
| Generic type parameter | Single uppercase letter or descriptive `PascalCase` | `T`, `K`, `V`, `TReturn` |
| Boolean | `is` / `has` / `can` / `should` prefix | `isVisible`, `hasError` |
| Async function | No `async` suffix; the `Promise<T>` return is the signal | `fetchUser`, not `fetchUserAsync` |
| Branded type | `PascalCase`, see [typescript.md](typescript.md) | `OrganizationId` |

## Imports

Order, separated by blank lines:

1. Node built-ins (`node:fs`, `node:path`).
2. External packages (`react`, `zod`).
3. Workspace packages (`@workspace/ui/components/button`).
4. Relative imports (`./helpers`, `../types`).

Inside each group, alphabetical. Target enforcement: ESLint `import/order` (planned, not yet installed in `packages/eslint-config`).

```ts
import { readFile } from "node:fs/promises"

import { z } from "zod"

import { Button } from "@workspace/ui/components/button"

import { parseAmount } from "./parse-amount"
import type { Order } from "../types"
```

## Exports

- Prefer named exports over default exports. Named exports survive refactors and grep.
- `index.ts` re-exports the public surface of a module: `export * from "./button"`.
- Default exports allowed only where a framework requires them (Next.js `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`).

## Workspace package names

`@workspace/<name>` (private). Examples: `@workspace/ui`, `@workspace/db`, `@workspace/eslint-config`.

App packages do not carry the `@workspace/` prefix: `web`, `api`.

## Database (forward-looking)

PostgreSQL 18, snake_case for tables and columns. Full words only (`account_`, `invoice_`, never `acc_`, `inv_`). Schema-level details land with `db-conventions.md` when DB schema lands.

## Environment variables

`SCREAMING_SNAKE_CASE`. Tool-imposed names (`DATABASE_URL`, `NODE_ENV`, `AWS_REGION`, etc.) keep their canonical form. Project-authored names get a project prefix once one is chosen (deferred until first contention).

## Enforcement

- Active: `tseslint.configs.recommended` in `packages/eslint-config` (covers basic TS naming).
- Planned: `eslint-plugin-import` `import/order`, `@typescript-eslint/naming-convention`, custom file-naming rule.
- Code review for cases lint cannot decide (e.g., `is` vs `has` boolean prefix).

## See also

- [typescript.md](typescript.md) — type, branded ID, exhaustiveness rules.
- [`packages/ui/`](../../packages/ui/) — UI-package primitives use kebab-case throughout for shadcn parity.
