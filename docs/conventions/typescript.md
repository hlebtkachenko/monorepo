# TypeScript conventions

Strict-mode TypeScript across every package. Rules are enforceable: lint catches them, code review catches the rest.

## Compiler settings

Active `tsconfig` flags (set in `packages/typescript-config/base.json`, inherited by every workspace):

| Flag | Value | Why |
|---|---|---|
| `strict` | `true` | Umbrella for the standard strict family. |
| `noUncheckedIndexedAccess` | `true` | `arr[i]` is `T \| undefined`, not `T`. Catches off-by-one and missing-key bugs at the type level. |
| `isolatedModules` | `true` | Every file compiles independently (matches Turbopack/esbuild semantics). |
| `target` | `ES2022` | Matches Node 22+ and modern browsers. |

Recommended additions (planned, not yet in `base.json`):

| Flag | Why deferred |
|---|---|
| `exactOptionalPropertyTypes` | Codebase passes today without it; flip after first audit. |
| `noImplicitOverride` | No class hierarchies in production code yet; turn on with first OOP package. |
| `verbatimModuleSyntax` | Bundler already strips type-only imports; flip when a runtime regression makes the case. |
| `forceConsistentCasingInFileNames` | Catch-all for cross-platform case mismatches; flip after first CI run on Linux exposes a miss. |

## Type vs interface

- `type` for unions, intersections, mapped types, primitives, and shapes that compose with utility types.
- `interface` for nominally-named extension points where consumers may augment (rare; `declare module` is the trigger).
- Default to `type`. Reach for `interface` only when augmentation matters.

## Branded IDs

Distinguish IDs by their semantic origin, not just `string`. Use Zod brands or a dedicated branded type:

```ts
type OrganizationId = string & { readonly __brand: "OrganizationId" }
type UserId = string & { readonly __brand: "UserId" }

function getMember(orgId: OrganizationId, userId: UserId): Promise<Member> { ... }
```

Compiler rejects `getMember(userId, orgId)` even though both are strings. Stops a class of cross-tenant and cross-entity bugs.

## Exhaustiveness

Use `assertNever` for switch / discriminated union exhaustiveness:

```ts
function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`)
}

switch (kind) {
  case "a": return handleA()
  case "b": return handleB()
  default: return assertNever(kind)
}
```

Adding a new variant to `kind` is now a compile error at every switch site.

## `import type`

Use `import type` for types and interfaces. The bundler strips the import entirely.

```ts
import type { User } from "./user"
import { getUser } from "./user"
```

Bundlers strip type-only imports; `verbatimModuleSyntax` will enforce the form when added (see Compiler settings above).

## any policy

`any` is forbidden in committed code. Allowed forms in shrinking order of acceptability:

1. `unknown` with a type guard. Default for boundary types.
2. `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a one-line comment explaining why. Must be in a PR description.
3. `as any` cast in a test fixture. Acceptable, do not normalize to production.
4. `any` in production code. Forbidden.

A `any` that survives review is a review failure, not a coding failure.

## Validate at boundaries only

Internal code trusts internal types. Validate at:

- HTTP / RPC entry points (Zod or equivalent).
- External API responses (untrusted shape).
- Database query results that cross a typed boundary.

Do not re-validate within the call graph. Internal trust is the point of static types.

## Null vs undefined

- `undefined` for missing or not-yet-set values.
- `null` only when an external system requires it (database `NULL`, JSON wire format).
- Avoid `T | null | undefined`; pick one.

## Enforcement

- `pnpm typecheck` (CI gate).
- ESLint `@typescript-eslint/*` rules enabled in `packages/eslint-config`.
- Code review for the boundary rule and `any` discipline.

## See also

- [`packages/typescript-config/`](../../packages/typescript-config/) — shared tsconfig presets.
- [`packages/eslint-config/`](../../packages/eslint-config/) — TS ESLint rules.
- [code-naming.md](code-naming.md) — file and identifier naming.
