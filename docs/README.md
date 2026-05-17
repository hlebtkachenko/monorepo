# docs/

Reference material for the monorepo. Live planning and issue tracking are in [Linear (AFF)](https://linear.app/hapddev) — read the issue before reading a file here.

## Subdirectories

| Directory                      | Purpose                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`adr/`](adr/)                 | Architecture Decision Records. Immutable after merge. Documents the _why_ behind non-obvious choices and constraints. Format: MADR-like. See `adr/README.md` for authoring rules and the full index. |
| [`api/`](api/)                 | OpenAPI and Zod schema definitions for the versioned REST API (`/v1/*` surface, see ADR-0020).                                                                                                       |
| [`conventions/`](conventions/) | Team conventions enforced by tooling or review: commit format (`COMMITS.md`), CI policy (`CI-POLICY.md`), TypeScript rules (`typescript.md`), code naming (`code-naming.md`).                        |
| [`env-vars.md`](env-vars.md)   | Catalogue of every environment variable the runtime consumes, grouped by package. Required vs optional, expected values, and which service provides each.                                            |
| [`INVENTORY.md`](INVENTORY.md) | DORA Article 8 ICT asset register. Lists third-party services, data classifications, and retention commitments.                                                                                      |
| [`plans/`](plans/)             | Legacy planning documents, each cross-linked to its Linear issue. Do not create new files here — open a Linear issue instead. Delete a file when its issue closes.                                   |
| [`runbooks/`](runbooks/)       | Operational runbooks: deploy, rollback, incident response, local dev setup, supply-chain verification, cost incident response, and component/showcase migration guides.                              |
| [`specs/`](specs/)             | Design specifications: auth layout, OIDC trust model, supply-chain policy. Stable enough to survive across sprints.                                                                                  |
