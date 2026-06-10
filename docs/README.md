# docs/

Reference material for the monorepo. Live planning and issue tracking are in [Linear](https://linear.app/hapddev) — read the issue before reading a file here. (Routing by function lives in `AGENTS.md`.)

## Subdirectories

| Directory                                    | Purpose                                                                                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`adr/`](adr/)                               | Architecture Decision Records. Immutable after merge. Documents the _why_ behind non-obvious choices and constraints. Format: MADR-like. See `adr/README.md` for authoring rules and the full index.  |
| [`api/`](api/)                               | OpenAPI and Zod schema definitions for the versioned REST API (`/v1/*` surface, see ADR-0020).                                                                                                        |
| [`compliance/`](compliance/)                 | Security & secrets control attestations (e.g. `SECRETS-CONTROLS.md`) backing the DORA register.                                                                                                       |
| [`conventions/`](conventions/)               | Team conventions enforced by tooling or review: commit format (`COMMITS.md`), CI policy (`CI-POLICY.md`), TypeScript rules (`typescript.md`), code naming (`code-naming.md`).                         |
| [`env-vars.md`](env-vars.md)                 | Catalogue of every environment variable the runtime consumes, grouped by package. Required vs optional, expected values, and which service provides each.                                             |
| [`INVENTORY.md`](INVENTORY.md)               | DORA Article 8 ICT asset register. Lists third-party services, data classifications, and retention commitments.                                                                                       |
| [`LAUNCH-CHECKLIST.md`](LAUNCH-CHECKLIST.md) | v1 launch gates: legal blockers, infra/cost posture flips, ops, auth decisions, deferred tracks. Owner: Hleb.                                                                                         |
| [`plans/`](plans/)                           | Stable reference dossiers that Linear issues point to: large audits, migration plans, research too big for an issue body. Progress tracking stays in Linear. Add/lifecycle policy: `plans/README.md`. |
| [`runbooks/`](runbooks/)                     | Operational runbooks: deploy, rollback, incident response, local dev setup, supply-chain verification, cost incident response, and component/showcase migration guides.                               |
| [`specs/`](specs/)                           | Design specifications: auth layout, OIDC trust model, supply-chain policy. Stable enough to survive across sprints.                                                                                   |
