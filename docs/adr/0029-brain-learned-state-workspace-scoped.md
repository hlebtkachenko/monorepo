# 29. Brain learned state is workspace-scoped

- Status: Proposed
- Date: 2026-07-05
- Deciders: Hleb Tkachenko

> Records the tenancy tier for anything the Brain LEARNS or REMEMBERS. Pairs with
> [ADR-0028](0028-brain-marshrutizator-isolation.md) (Brain v1 is an unprivileged
> client booking through the accounting API) and [ADR-0010](0010-multi-tenant-rls.md)
> (the FORCE-RLS isolation floor). First concrete instance: the OCR template library.

## Context and Problem Statement

The Brain learns from what it books. Its first learned artifact is the **OCR template library**:
when it reads a supplier's invoice, it records which region of the page carries each field (a
`locators` map) so the next document from that supplier extracts without a re-read. More learned
state follows (KB-as-data, memory-as-data). Each of these needs a tenancy tier, and the choice is
not obvious because the platform already has two scopes: **organization** (a single client book,
GUC `app.organization_id`) and **workspace** (the accountant's office, GUC `app.workspace_id`).

A supplier's invoice layout does not change per client book. If office X does the accounting for
clients A and B and both buy from vendor V, V's invoice looks the same on both books — so a template
learned while booking for A must be reusable while booking for B. Scoping the template to the
organization would relearn (and re-confirm) the same layout N times per office, once per client that
shares the supplier, and never let confidence accumulate across a workspace. Organization is the
*momentary* scope in which a document is booked; it is the wrong home for durable, cross-client
knowledge.

## Decision

Anything the Brain **learns or remembers** is **workspace-scoped**: isolated on the GUC
`app.workspace_id` under FORCE RLS, shared across every organization in the workspace, and **not**
organization-scoped. The OCR template library (`ocr_extraction_template`, migration 0047) is the
first instance and sets the pattern for future learned state (KB-as-data, memory-as-data).

Mechanically this **mirrors `counterparty` exactly** (the existing workspace-scoped table): a
`workspace_id` column, four command-specific RLS policies (`SELECT` / `INSERT` / `UPDATE` /
`DELETE`) keyed on `workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid`, and
a composite `UNIQUE (id, workspace_id)` that closes the cross-workspace FK-bypass hole for any
org-tier table that later references the row (Postgres FK checks run internal and skip RLS, so the
composite FK, not RLS alone, is what isolates across the reference).

## Consequences

Positive:

- A supplier's layout is learned once per office and reused across every client that shares the
  supplier; confidence (`human_confirmed_at`, `held_count`, `last_reject_at`) accumulates at the
  right grain.
- Uniform tenancy for all future learned state — one tier, one RLS shape, one composite-FK rule to
  reason about. New learned-data tables copy `counterparty` / `ocr_extraction_template` verbatim.
- No new isolation mechanism: the workspace-scoped FORCE-RLS pattern already exists and is exercised
  by the cross-workspace leak harness.

Negative / trade-offs:

- Learned state is not isolated *between clients of the same office*. This is intentional (the whole
  point is cross-client reuse), but it means a template poisoned while booking for one client would
  be visible to the office's other books — mitigated by the human-confirmation + held/reject
  signals, which are the Brain's confidence gate, not an isolation boundary.
- Workspace-scoped rows referenced by org-tier tables MUST use the composite `(id, workspace_id)` FK,
  never a bare `id` FK — a bare FK across the workspace boundary would bypass RLS.

Follow-up work required:

- Wire the Brain OCR template read/write path (learn on confirm, re-detect on `layout_fingerprint`
  drift). Tracked as Brain OCR work (#518).
- When KB-as-data / memory-as-data land, they adopt this same tier; each new learned table adds
  itself to `WORKSPACE_SCOPED_TABLES` (`packages/db/src/policies/rls.ts`) and a migration with the
  four command-specific policies.

## Alternatives considered

- **Organization-scoped learned state** — rejected: relearns the same supplier layout once per
  client that shares the supplier, never accumulates confidence across the office, and contradicts
  the fact that a layout is a supplier property, not a client-book property.
- **Global (cross-workspace) template library** — rejected: leaks one office's supplier knowledge
  (and any embedded field values / provenance) to every other tenant; a supplier normalization or a
  poisoned template would cross tenant boundaries. Workspace is the correct sharing radius.
- **A bespoke non-RLS store** — rejected: reinvents isolation the FORCE-RLS + composite-FK pattern
  already provides for `counterparty`; compose, don't build.

## See also

- [ADR-0010](0010-multi-tenant-rls.md) (FORCE RLS), [ADR-0028](0028-brain-marshrutizator-isolation.md)
  (Brain client isolation at the API front door)
- Code anchor: `packages/db/migrations/0047_ocr_extraction_template.sql`,
  `packages/db/src/schema/ocr_extraction_template.ts`,
  `packages/db/src/policies/rls.ts` (`WORKSPACE_SCOPED_TABLES`),
  `packages/db/tests/rls-cross-workspace.test.ts`
- `counterparty` (the mirrored workspace-scoped precedent):
  `packages/db/migrations/0035_accounting_enforcement.sql` §2
