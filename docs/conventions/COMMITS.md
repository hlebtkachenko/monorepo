# Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). The CI commitlint job enforces this on every PR.

## Format

```
<type>(<scope>)?: <subject>

<body>

<footer>
```

- Subject line ≤ 72 characters, imperative mood ("add X", not "adds X").
- Blank line between subject, body, footer.
- Body wraps at 100 characters.

## Allowed types

| Type | When |
|------|------|
| `feat` | New end-user-visible capability or new public API |
| `fix` | Bug fix in existing functionality |
| `chore` | Maintenance: deps, config, build infra not affecting behavior |
| `docs` | Documentation only (`docs/`, `README.md`, ADRs, runbooks) |
| `refactor` | Behavior-preserving internal change |
| `test` | Adding or updating tests; no production code change |
| `perf` | Performance improvement |
| `ci` | CI / GitHub Actions config changes |
| `build` | Build system, bundler, container images, Dockerfile |
| `style` | Formatting only; no code logic change. Rare; usually rolled into `chore` |
| `revert` | Reverts a previous commit; body cites the SHA |

If unsure, pick the type that best describes the **observable** change. `feat` and `fix` carry the most weight in release notes.

## Scope (optional)

Use the package or surface name:
- `feat(ui): add Drawer component`
- `fix(web): handle missing BUILD_SHA in /api/version`
- `chore(deps): bump pnpm 11.0.9 -> 11.1.0`
- `docs(adr): add 0007 caching strategy`

Skip the scope when the change is genuinely cross-cutting.

## Subject

- Imperative mood: "add", "fix", "remove" — not "added", "fixes".
- No trailing period.
- Lowercase first word (allowed exception: proper names).

## Body

Explain *why*, not *what*. The diff already shows what changed.

Good:
```
fix(web): standardize Build* env var defaults across runtime endpoints

Without a default, a missing BUILD_TIME on local dev surfaced as `undefined` in the
JSON response. Standardize to "unknown" so monitoring queries can equality-check
against a known string.
```

Bad:
```
fix(web): fix bug
```

## Footer

Used for breaking changes and issue references.

Breaking change:
```
feat(ui): rename Drawer to Sheet for shadcn parity

BREAKING CHANGE: import path changed from "@workspace/ui/components/drawer"
to "@workspace/ui/components/sheet". Migration: codemod in scripts/codemod/sheet.ts.
```

Issue references:
```
fix(web): handle empty showcase grid

Closes #123, refs #122
```

## Pre-commit

A commit-msg hook (lefthook or husky, project-specific) runs commitlint locally. Same rules in CI; failing in CI but passing locally usually means the local hook is not installed.

## Cross-references

- `commitlint.config.mjs` (root) — the enforcement rule set.
- `docs/conventions/CI-POLICY.md` — when commitlint is advisory vs blocking.
