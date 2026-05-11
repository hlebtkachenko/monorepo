# Code review checklist

Items that catch repeat nits across PRs. Reviewer skims this before approving. Author skims before requesting review.

## Always

- [ ] PR title is conventional commit (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`, `build:`, `style:`, `revert:`).
- [ ] Squash-merge title will read cleanly on `main` (no `WIP`, no draft markers, no commit-id leftovers).
- [ ] PR description has Summary (1-3 bullets), Test plan, Risk Classification (DORA), Rollback Plan if non-trivial.
- [ ] CI green (or path-filtered checks legitimately skipped).
- [ ] CHANGELOG.md updated under `[Unreleased]` if user-visible behavior changed.
- [ ] No secret-shaped strings in diff (api keys, postgres URLs with creds, JWTs, age keys). `gitleaks` and `check-client-secrets` catch most; eyeball anyway.

## Code quality

- [ ] No `any` in production code (test fixtures fine; see [typescript.md](../conventions/typescript.md)).
- [ ] No new `// @ts-expect-error` / `// @ts-ignore` without a one-line reason comment.
- [ ] No premature abstractions (three similar lines beats one helper used once).
- [ ] No defensive code for impossible scenarios (validate at boundaries, trust internal types).
- [ ] No backwards-compat shims for code that hasn't shipped.
- [ ] No comments that only restate the code. Comments explain *why*, not *what*.
- [ ] Errors quoted exact in error messages (no rephrased copies).

## Tests

- [ ] New code has tests (Vitest unit/component minimum).
- [ ] Tests cover the failure mode you'd want to catch in production, not the happy path you already debugged.
- [ ] Mocks match the real surface (don't mock-and-pass; verify the real shape).
- [ ] No `.only` / `.skip` left in committed tests.

## Dependencies

- [ ] New runtime dependency? Justify in PR description (license, maintenance, alternative).
- [ ] New devDependency goes in the correct workspace (root vs package).
- [ ] No `pnpm install` without lockfile commit.
- [ ] License is permissive (MIT/Apache-2/BSD/ISC). Copyleft requires sign-off.

## Security

- [ ] No `process.env.X` access in client code (server-only env vars are inlined as strings; check via `pnpm check:client-secrets` after `pnpm --filter web build`).
- [ ] User input validated at the boundary (Zod schema or equivalent).
- [ ] No SQL string interpolation (parameterized queries only; Drizzle handles this).
- [ ] No `eval`, no `Function(string)`, no `dangerouslySetInnerHTML` without explicit review.
- [ ] CORS / CSP rules tightened, not loosened.

## Architecture

- [ ] Architectural decision recorded as ADR if non-obvious (see [docs/adr/README.md](../adr/README.md) "When to write an ADR").
- [ ] Cost change recorded if AWS/paid resource added (PR template Cost Estimate section).
- [ ] Breaking change explicitly called out with migration path.

## Reviewer's last pass

- [ ] Run the change locally if it touches build, CI, or developer experience.
- [ ] Read the diff backwards (last commit first); catches author's last-minute regrets.
- [ ] Approve or request changes, never "leave a comment" with no signal.

## See also

- [docs/conventions/typescript.md](../conventions/typescript.md)
- [docs/conventions/code-naming.md](../conventions/code-naming.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [.github/pull_request_template.md](../../.github/pull_request_template.md)
