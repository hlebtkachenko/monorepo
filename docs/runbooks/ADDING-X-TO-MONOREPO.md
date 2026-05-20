# Runbook: Adding X to the monorepo

Per-X procedures. Pick the section that matches what you're adding.

## A new package (`packages/<name>`)

1. `mkdir packages/<name> && cd $_`
2. `pnpm init -y` then rename to `@workspace/<name>` (private).
3. Copy `tsconfig.json`, `eslint.config.js`, and `vitest.config.ts` from
   `packages/shared` (closest match for a pure library).
4. Add to root `pnpm-workspace.yaml` only if outside `packages/*` (most
   adds don't need this).
5. Wire `@workspace/eslint-config` + `@workspace/typescript-config` as
   `devDependencies`.
6. `pnpm install` → make sure the package resolves.
7. Add at least one test + run `pnpm --filter @workspace/<name> test`.

## A new app (`apps/<name>`)

Same as package, plus:

1. Set `private: true` and add a `dev` script.
2. Web app → clone `apps/web/{next.config.mjs, postcss.config.mjs,
tsconfig.json, eslint.config.js, Dockerfile}` and trim what you
   don't need.
3. NestJS service → clone `apps/api/{tsconfig.json, eslint.config.js,
vitest.config.ts, scripts/emit-openapi.ts}`.
4. CDK: add an ECR repo in `infra/cdk/lib/data-stack.ts`, surface a
   `<name>Repository` prop, add a container in
   `infra/cdk/lib/app-stack.ts`, add a Cloudflare Tunnel ingress rule
   in the Zero Trust dashboard. Update `infra/cdk/tests/helper.ts`.
5. Wire the build into `.github/workflows/_build-image.yml` (clone an
   existing call site).

## A new runbook

1. `docs/runbooks/<TOPIC>.md` for operator-facing material. End-user
   help no longer has a hosted surface (ADR-0024 Amendment 2026-05-21);
   put end-user-facing copy in the relevant Next.js page or wait for a
   future docs surface.
2. Link from `docs/START-HERE.md` and from any related runbook.
3. If the runbook covers an incident class, also link from
   `docs/runbooks/INCIDENT.md`.

## A new ADR

1. `cp docs/adr/template.md docs/adr/$(printf '%04d' $((max+1)))-<slug>.md`
   (use the next free number; `ls docs/adr/ | tail -3` shows the latest).
2. MADR format. Keep `Status`, `Context`, `Decision`, `Consequences`.
3. If the ADR supersedes an earlier one, set the older ADR's status to
   `Superseded by ADR-NNNN` in the same PR.
4. Link from `docs/START-HERE.md` "Decisions backing this layout" if
   the ADR is foundational.

## A new GitHub Actions workflow

1. Start from `.github/workflows/_template-update-check.yml.example`
   when the workflow gates a versioned dependency.
2. Otherwise clone the closest existing workflow:
   - Coverage check → `mcp-coverage.yml`.
   - Drift gate → `openapi-lint.yml` / `sdk-drift.yml`.
   - Scheduled audit → `osv-scanner-nightly.yml`.
3. Required workflow hardening (every new workflow):
   - `permissions: {}` at the top.
   - `step-security/harden-runner@<sha> # vX.Y.Z` with `egress-policy: audit`.
   - SHA-pinned action versions with trailing version comment.
   - Concurrency block with `cancel-in-progress` on PRs.
4. Ship as `continue-on-error: true` advisory until the first green PR
   cycle. Hleb flips required-status manually after observing it green.
5. Run `actionlint` locally before pushing.

## A new MCP tool

Tools are codegen output. Don't hand-write one. Add the upstream
endpoint per `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`; the codegen
emits the tool file under `apps/mcp/src/tools/generated/`. Curate the
annotations in `apps/mcp/src/tools/_curate.ts`.

## A new SDK option

1. Extend `AfframeClientOptions` in `packages/sdk/src/client.ts`.
2. Wire the option through `createAfframeClient`.
3. Document in `packages/sdk/README.md`.
4. Changeset entry.

## A new env var

1. Read it in code via `process.env.<NAME>`. Default-safe values for
   non-production paths; throw on missing in production where
   appropriate.
2. Declare in `turbo.json` `globalEnv`.
3. Document in `docs/env-vars.md` under the section matching the
   consumer (web / api / admin / db / auth / etc.).
4. If CI / production needs it, add the corresponding GitHub Actions
   repo variable or Secrets Manager entry. Cross-reference from
   `docs/runbooks/SECRETS.md` and `docs/runbooks/AWS-DEPLOY.md`.

## A new public host

1. Provision DNS + Cloudflare Tunnel ingress (dashboard).
2. Add an ECR repo + ECS container + LogGroup per
   `infra/cdk/lib/{data,app}-stack.ts` (clone the closest existing host
   block).
3. `docs/DOMAINS-AND-EMAIL.md` — add an inventory entry.
4. `docs/env-vars.md` — add the per-env `*_DOMAIN` row.
5. `infra/cdk/bin/app.ts` — read the env var, pass to AppStack.
6. `infra/cdk/tests/helper.ts` — add the test domain constant.
