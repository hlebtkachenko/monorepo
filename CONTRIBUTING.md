# Contributing

Thanks for your interest. This repository is the foundation of a financial SaaS monorepo. It is currently a UI scaffold; production code lands later. While public, contributions are welcome under the rules below.

## Before you start

1. Read `AGENTS.md` (project conventions)
2. Read `docs/conventions/COMMITS.md` (conventional commits)
3. Read `docs/conventions/CI-POLICY.md` (CI gate policy)
4. Read `SECURITY.md` (vulnerability disclosure)

## Reporting bugs

Open an issue with:
- Expected vs actual behavior
- Reproduction steps (smallest possible)
- Environment (Node version, OS, browser if frontend)
- Logs or screenshots

For security issues do **not** open a public issue. See `SECURITY.md`.

## Submitting changes

1. Fork the repo and create a topic branch from `main` (e.g. `feat/short-slug`).
2. Make focused, atomic commits. **One concern per PR** — no mega-PRs.
3. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`, `build:`, `style:`, `revert:`.
4. Sign your commits (SSH or GPG). Branch protection on `main` requires signed commits — set up signing per [GitHub docs](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification).
5. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` locally before opening a PR.
6. Fill out the PR template completely. Risk classification fields are required.

## Local development

```sh
# Bootstrap toolchain (Node 24, pnpm 11, OpenTofu, awscli, etc.)
mise install

# Or use the devcontainer (matches CI exactly)
# Open the repo in VS Code → "Reopen in Container"

pnpm install --frozen-lockfile
pnpm dev          # apps/web at http://localhost:3000
pnpm test         # 144 tests
```

## Code style

- TypeScript 6+ everywhere.
- No unnecessary comments.
- No premature abstractions.
- Validate at system boundaries only.
- One concern per file. Don't bundle unrelated changes.

## Pull request checks

Every PR triggers (advisory until promoted to required-status):

| Check | What it does |
|---|---|
| `ci` | typecheck, lint, test, storybook build, build |
| `gitleaks` | secret scan |
| `workflow-lint` | actionlint + zizmor (only when workflows change) |
| `codeql` | JS/TS SAST |
| `dependency-review` | CVE + license check on PR diff |
| `commitlint` | conventional commits enforcement |
| `size-limit` | bundle budget on `apps/web` |
| `osv-scanner-pr` | dependency CVE scan |
| `container-scan` | Trivy fs+image (when `apps/web/Dockerfile` changes) |

## License

Contributions are licensed under the MIT License (see `LICENSE`). By submitting a PR you agree your contributions are licensed under MIT.

## Code of conduct

Participation in this project requires following the [Code of Conduct](CODE_OF_CONDUCT.md).
