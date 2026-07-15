# Documentation

Documentation map and ownership rules for the monorepo. Agents use this file
to find the canonical document for a task without duplicating the project
overview in the root [`README.md`](../README.md).

GitHub Issues are authoritative for active work. Documentation explains the
system, decisions, contracts, and repeatable procedures. It does not replace
issue status, assignees, priorities, or sprint planning.

## Agent navigation

For a fresh session:

1. Read the root [`README.md`](../README.md) for the monorepo purpose and basic workflow.
2. Read [`AGENTS.md`](../AGENTS.md) for mandatory repository rules.
3. Read the GitHub issue that defines the work.
4. Open the task-specific documentation below.
5. Run `pnpm codegraph:ready` before structural code exploration.

| Task                                          | Read                                                                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add or change an API endpoint                 | [`runbooks/ENDPOINT-ADDITION-RUNBOOK.md`](runbooks/ENDPOINT-ADDITION-RUNBOOK.md)                                                                                                                                                            |
| Add a package, app, runbook, ADR, or workflow | [`runbooks/ADDING-X-TO-MONOREPO.md`](runbooks/ADDING-X-TO-MONOREPO.md)                                                                                                                                                                      |
| Work on app-shell pages or navigation         | [`runbooks/APP-SHELL-PANELS.md`](runbooks/APP-SHELL-PANELS.md) and [`specs/SITEMAP.md`](specs/SITEMAP.md)                                                                                                                                   |
| Choose a content layout                       | [`specs/CONTENT-ARCHETYPES.md`](specs/CONTENT-ARCHETYPES.md)                                                                                                                                                                                |
| Work on local development                     | [`runbooks/LOCAL-DEV.md`](runbooks/LOCAL-DEV.md)                                                                                                                                                                                            |
| Query production or staging data              | [`runbooks/DB-ACCESS.md`](runbooks/DB-ACCESS.md)                                                                                                                                                                                            |
| Deploy                                        | [`runbooks/DEPLOY.md`](runbooks/DEPLOY.md)                                                                                                                                                                                                  |
| Roll back                                     | [`runbooks/ROLLBACK.md`](runbooks/ROLLBACK.md)                                                                                                                                                                                              |
| Respond to an incident                        | [`runbooks/INCIDENT.md`](runbooks/INCIDENT.md)                                                                                                                                                                                              |
| Rotate or manage secrets                      | [`runbooks/SECRETS-ADD-DELETE.md`](runbooks/SECRETS-ADD-DELETE.md), [`runbooks/SECRETS-ROTATION.md`](runbooks/SECRETS-ROTATION.md), and [`conventions/SECRETS-AND-VARIABLES.md`](conventions/SECRETS-AND-VARIABLES.md)                      |
| Understand or change S3 storage               | [`adr/0031-s3-storage-and-document-working-store.md`](adr/0031-s3-storage-and-document-working-store.md) for decisions and pricing, then [`runbooks/DOCUMENT-STORE.md`](runbooks/DOCUMENT-STORE.md) for implemented behavior and operations |
| Configure CI                                  | [`conventions/CI-POLICY.md`](conventions/CI-POLICY.md)                                                                                                                                                                                      |
| Prepare a release                             | [`conventions/RELEASES.md`](conventions/RELEASES.md)                                                                                                                                                                                        |
| Build or review UI components                 | [`runbooks/SHOWCASE.md`](runbooks/SHOWCASE.md) and [`runbooks/COMPONENT-MIGRATION.md`](runbooks/COMPONENT-MIGRATION.md)                                                                                                                     |
| Understand or operate Afframe Brain           | [`brain/README.md`](brain/README.md), [`brain/TECHNICAL.md`](brain/TECHNICAL.md), and [`runbooks/BRAIN-OPERATOR-SESSION.md`](runbooks/BRAIN-OPERATOR-SESSION.md)                                                                            |
| Check Brain delivery status                   | GitHub epic [#524](https://github.com/hlebtkachenko/monorepo/issues/524)                                                                                                                                                                    |

## Taxonomy

| Location                                   | Owns                                                                                  | Does not own                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Concise current system shape and major runtime boundaries                             | Decision history or operating procedures                         |
| [`adr/`](adr/)                             | Immutable architecture decisions, alternatives, and consequences                      | Current task status or implementation tutorials                  |
| [`api/`](api/)                             | Current public API architecture and client-platform guidance                          | Future product contracts                                         |
| [`brain/`](brain/)                         | Cross-package Brain overview and technical architecture                               | Delivery status or operator procedures                           |
| [`compliance/`](compliance/)               | Control mappings and audit evidence indexes                                           | General security tutorials or incident procedures                |
| [`conventions/`](conventions/)             | Normative repository rules enforced by tooling or review                              | Step-by-step operations                                          |
| [`plans/`](plans/)                         | Bounded future-work context, research, and cross-cutting acceptance criteria          | Issue-level status, assignments, priorities, or due dates        |
| [`runbooks/`](runbooks/)                   | Repeatable, ordered procedures for operating production or maintaining the repository | Product intent, architecture decisions, or historical narratives |
| [`specs/`](specs/)                         | Stable product, UI, security, and data contracts                                      | Runtime status or procedural instructions                        |

Cross-cutting registries may live directly under `docs/` when no category owns
them. Current examples: [`DOMAINS-AND-EMAIL.md`](DOMAINS-AND-EMAIL.md) and
[`ENVIRONMENT-VARIABLES.md`](ENVIRONMENT-VARIABLES.md).

## Canonical sources

When prose and an executable source disagree, verify the executable source and
update the prose in the same change.

| Concern                           | Canonical source                                                                  | Human-readable mirror                                             |
| --------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Workspace inventory and commands  | Root and workspace `package.json` files, `pnpm-workspace.yaml`, `turbo.json`      | [`../README.md`](../README.md) and package READMEs                |
| Current architecture              | Running code and infrastructure configuration                                     | [`../ARCHITECTURE.md`](../ARCHITECTURE.md)                        |
| Architecture rationale            | Individual ADR file                                                               | [`adr/README.md`](adr/README.md) index                            |
| Public API schemas and operations | `packages/shared/src/api/registry.ts` and generated `apps/api/openapi/v1.json`    | [`api/README.md`](api/README.md) and Scalar at `api.afframe.com/` |
| Org navigation and routes         | Typed `nav.ts` trees under `apps/web/app/[orgSlug]`                               | [`specs/SITEMAP.md`](specs/SITEMAP.md)                            |
| App structure API snapshot        | `scripts/gen-structure.ts` output and `packages/shared/src/api/structure.ts`      | [`api/AGENT-STRUCTURE.md`](api/AGENT-STRUCTURE.md)                |
| Environment variables             | Runtime `process.env` readers and deployment wiring                               | [`ENVIRONMENT-VARIABLES.md`](ENVIRONMENT-VARIABLES.md)            |
| Document-store runtime behavior   | Storage, route, DB, and CDK sources linked by the runbook                         | [`runbooks/DOCUMENT-STORE.md`](runbooks/DOCUMENT-STORE.md)        |
| Release process                   | [`conventions/RELEASES.md`](conventions/RELEASES.md) and release workflows        | [`../CHANGELOG.md`](../CHANGELOG.md)                              |
| Active work and delivery status   | GitHub Issues and active GitHub Project                                           | Plans provide context only                                        |
| Brain implementation status       | Code and GitHub epic [#524](https://github.com/hlebtkachenko/monorepo/issues/524) | [`brain/`](brain/) technical documentation                        |

Generated files are never edited by hand. Run their generator and commit the
result. Transient analysis under `.context/` is workspace-local and must not be
the only target of a link from tracked documentation.

## Document lifecycle

Every document must fit one taxonomy row and have one clear owner source.

- Live documentation states current behavior without legacy tracker promises.
- Concept content starts with an explicit `Concept` status note and cannot be
  presented as a shipped contract.
- Snapshot documents include a date. Move them to `_junk/` when their event is
  complete or a live source replaces them.
- Files are never permanently deleted during cleanup. Move obsolete material
  to `_junk/` and preserve Git history.
- New documents must be linked from this file, a directory index, or a relevant
  parent document.

## Change rules

When code changes a documented surface, update its closest human-readable
mirror in the same PR:

- Workspace changes: root README and relevant package README.
- API changes: Zod registry, generated OpenAPI, SDK/MCP output, and API docs.
- Navigation changes: typed nav, generated structure, and sitemap annotation.
- Environment changes: deployment wiring and [`ENVIRONMENT-VARIABLES.md`](ENVIRONMENT-VARIABLES.md).
- Operational changes: affected runbook and rollback path.
- New architectural constraint: ADR plus architecture overview when system-wide.

Keep links relative, use one H1, and prefer direct links to canonical files over
duplicated inventories.
