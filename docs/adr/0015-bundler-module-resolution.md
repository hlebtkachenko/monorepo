# 15. Monorepo uses Bundler moduleResolution; relative imports omit `.js`

- Status: Accepted
- Date: 2026-05-12
- Deciders: Hleb Tkachenko

## Context and Problem Statement

`packages/db` originally used NodeNext moduleResolution with TS-ESM-canonical `.js`-suffixed relative imports (`from "./app_user.js"`). When the first `apps/web` consumer of `@workspace/db` landed, Turbopack (Next 16 default bundler) refused to resolve the `.js` extension back to the source `.ts` file inside `transpilePackages`:

```
Module not found: Can't resolve './app_user.js'
```

This is a known Turbopack limitation for source-first workspace packages.

`@workspace/ui` already shipped with Bundler moduleResolution and zero `.js` suffixes, working in production. `packages/{db,observability,testcontainers}` were the outliers; main never hit the issue because no app code imported them yet.

Three options were evaluated:

1. **Strip `.js` from the three Node-style packages** (align to `@workspace/ui` precedent).
2. **Build packages to `dist/` and consume the artifacts** — bigger change, slower dev cycle, needs watch processes.
3. **Eject Turbopack, switch `apps/web` to webpack** — gives up Next 16 default bundler perf.

## Decision

Adopt Option 1. Every workspace package (library and app) uses Bundler moduleResolution. Relative TS imports + re-exports MUST omit the `.js` extension. NodeNext + `.js` is reserved for future packages that publish to npm consumers running raw Node (none exist today).

Mechanics:

- New `@workspace/typescript-config/node-library.json` mirrors `react-library.json` minus JSX.
- `packages/{db,observability,testcontainers}` extend `node-library.json`.
- One-shot codemod stripped `.js` from 91 relative imports across the three packages' `src/**`.
- `apps/web/next.config.mjs` adds the three packages to `transpilePackages`.
- ESLint rule (`no-restricted-syntax` against three AST patterns) forbids `.js`-suffixed relative imports + re-exports in TS source files. Scope is `packages/**/src/**/*.{ts,tsx}` and `apps/**/*.{ts,tsx}` so real `.js` files at package roots (postcss configs, eslint configs) are untouched.

## Consequences

Positive:

- One uniform module-resolution strategy across the monorepo.
- `apps/web` builds against `@workspace/db` (and any transitive workspace dep) under Turbopack without per-package opt-outs.
- ESLint enforces the rule on save; the build never regresses to the `.js`-suffix mistake.
- No runtime overhead — Bundler resolution is purely a tsc/IDE concern; emitted code is identical.

Negative / trade-offs:

- Diverges from TS-ESM canonical style. Any future package that needs raw-Node-ESM consumption (no bundler) must opt back to NodeNext via a dedicated tsconfig and stay out of `transpilePackages`.
- Loses the IDE affordance where `.js` extensions help disambiguate runtime vs source-only imports. Negligible in this codebase (one bundler everywhere).

Follow-up work required:

- None for current packages.
- If a package is ever published to npm for external Node consumers, revisit with a dual-build setup (Bundler source + `dist/` NodeNext emit).

## Alternatives considered

- **Build packages to `dist/` and consume artifacts** — production-monorepo standard but heavier: every package needs a watch process during dev, `tsc -b` orchestration, and `package.json` `exports` pointing at emit paths. Wrong tradeoff at current size.
- **Drop Turbopack, use webpack** — regresses Next 16 default; perf hit visible in dev startup time; doesn't fix the underlying convention drift.
- **Keep `.js`, add a Turbopack `resolveExtensions` shim** — fragile (experimental config), bundler-specific (each consumer of these packages would need the shim), still leaves `@workspace/ui` as the only Bundler outlier.

## See also

- `packages/typescript-config/node-library.json` — new tsconfig preset
- `packages/eslint-config/base.js` — `no-restricted-syntax` guardrail
- `apps/web/next.config.mjs` — `transpilePackages` extended
