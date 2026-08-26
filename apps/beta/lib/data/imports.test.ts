/**
 * The import spine through the seam (spec §3.2, §4).
 *
 * Extends the contract `scope.test.ts` establishes and `filings.test.ts`
 * follows: every org-scoped surface reaches its data through `requireScope`, the
 * sessions are genuine Better Auth sessions, and only `next/headers` is mocked
 * because there is no HTTP request in a test runner.
 *
 * The DB-level floor (partial unique, coherence CHECKs, freeze + draft
 * triggers) is `db/import-spine.test.ts`. What is tested here is the RITUAL:
 * publish, supersede, rollback, idempotency, and who is allowed to see a draft.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createImportBatchRow,
  createMonthPeriod,
  createReportingPeriod,
  createTrialBalanceLineRow,
  endFixtures,
  readImportBatchRow,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

// Type-only, so importing it here does not evaluate the module before
// globalSetup has set DATABASE_URL — every RUNTIME import below is dynamic for
// that reason, and these are erased at compile time.
import type {
  PublishRefusal,
  StatementLineInput,
  TrialBalanceLineInput,
} from "./imports"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireOwner, requireScope } = await import("./scope")
const {
  IMPORT_DATASETS,
  batchHistoryForScope,
  createDraftBatch,
  datasetFreshnessForScope,
  deleteDraftBatch,
  publishBatch,
  publishedBatchFor,
  rollbackDataset,
  statementLinesForBatch,
  trialBalanceLinesForBatch,
} = await import("./imports")
const { forbiddenClientKeys } = await import("./projections")

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

async function expect404(
  run: () => Promise<unknown> | unknown,
  because: string,
): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest, because).toBe(NOT_FOUND_DIGEST)
}

function as(headers: Headers): void {
  request.headers = headers
}

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  ;[orgA, orgB] = await Promise.all([seedOrganization(), seedOrganization()])
})

afterAll(async () => {
  await endFixtures()
})

/**
 * The office's own write handle.
 *
 * `requireOwner` over a freshly resolved `OrgScope` — the same two-step every
 * Pro účetní page performs. There is no `requireOwner(orgSlug)` shorthand on
 * purpose (see `scope.ts`), so the tests mint the handle exactly as production
 * does rather than through a fixture that could drift from it.
 */
async function ownerScope(org: TestOrganization) {
  as(org.members.owner.headers)
  return requireOwner(await requireScope(org.slug))
}

/**
 * A Czech rozvaha, small but shaped exactly like the statutory form: aktiva in
 * brutto / korekce / netto / minulé, pasiva in běžné / minulé (Advisor F7/F8).
 */
const ROZVAHA_LINES = [
  {
    statementKind: "rozvaha_aktiva" as const,
    ozn: "",
    rowCode: "001",
    rowLabel: "AKTIVA CELKEM",
    sortOrder: 1,
    isBold: true,
    brutto: "5120000.00",
    korekce: "-1230000.50",
    netto: "3889999.50",
    minule: "4010500.25",
  },
  {
    statementKind: "rozvaha_aktiva" as const,
    ozn: "B.II.",
    rowCode: "014",
    rowLabel: "Dlouhodobý hmotný majetek",
    sortOrder: 2,
    indent: 1,
    brutto: "4560000.00",
    korekce: "-1230000.50",
    netto: "3329999.50",
    // Deliberately absent: a blank cell on the form is not a zero (§0.4).
    minule: null,
  },
  {
    statementKind: "rozvaha_pasiva" as const,
    ozn: "",
    rowCode: "078",
    rowLabel: "PASIVA CELKEM",
    sortOrder: 3,
    isBold: true,
    bezne: "3889999.50",
    minule: "4010500.25",
  },
  // `satisfies` rather than a plain annotation: the literal types survive (so
  // the discriminated payload arm still narrows) AND the fixture is checked
  // against the real input contract, so a renamed field breaks here rather
  // than silently seeding a world the write path cannot produce.
] as const satisfies readonly StatementLineInput[]

const VZZ_LINES = [
  {
    statementKind: "vzz" as const,
    ozn: "I.",
    rowCode: "001",
    rowLabel: "Tržby z prodeje výrobků a služeb",
    sortOrder: 1,
    bezne: "8400000.00",
    minule: "7250000.00",
  },
  {
    statementKind: "vzz" as const,
    ozn: "***",
    rowCode: "057",
    rowLabel: "Výsledek hospodaření za účetní období",
    sortOrder: 2,
    isBold: true,
    bezne: "-125400.75",
    minule: "310200.00",
  },
] as const satisfies readonly StatementLineInput[]

const PREDVAHA_LINES = [
  {
    accountCode: "211",
    accountName: "Pokladna",
    openingBalance: "35000.00",
    turnoverDebit: "120000.00",
    turnoverCredit: "-98500.50",
    closingBalance: "56499.50",
  },
  {
    accountCode: "221100",
    accountName: "Bankovní účet CZK",
    openingBalance: "1250000.00",
    turnoverDebit: "890450.75",
    turnoverCredit: "-12000.25",
    closingBalance: "2128450.50",
  },
] as const satisfies readonly TrialBalanceLineInput[]

/** A refusal, typed — so a renamed reason breaks the test rather than the UI. */
const refused = (reason: PublishRefusal) => ({ ok: false, reason })

describe("createDraftBatch — the office stages an import", () => {
  it("writes the batch and its rows in one transaction, as a draft", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })

    expect(batch.rowCount).toBe(3)
    const row = await readImportBatchRow(batch.id)
    expect(row.status).toBe("draft")
    expect(row.published_at).toBeNull()
    expect(row.row_count).toBe(3)

    const lines = await statementLinesForBatch(scope, batch.id)
    expect(lines).toHaveLength(3)
  })

  /**
   * OWNER-ONLY, AND THE TYPE IS THE GATE.
   *
   * `createDraftBatch`, `publishBatch`, `rollbackDataset` and
   * `deleteDraftBatch` all take an `OwnerScope`, so handing any of them a
   * member's or a guest's handle does not compile — there is no runtime path
   * left to assert against, which is the point of PR 14's brand. What CAN be
   * asserted is the only door that mints one, and that it refuses every other
   * role with a 404 rather than a 403 (a 403 on Pro účetní would confirm the
   * section exists for someone).
   */
  it("is owner-only — no other role can mint the write handle", async () => {
    const org = await seedOrganization()

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const scope = await requireScope(org.slug)
      await expect404(
        () => requireOwner(scope),
        `${role} must not reach the import writes`,
      )
    }

    // And the owner does get one, so the refusal above is about the role and
    // not about the fixture.
    as(org.members.owner.headers)
    expect(requireOwner(await requireScope(org.slug)).role).toBe("owner")
  })

  it("cannot be pointed at another organization's period", async () => {
    const foreignPeriodId = await createMonthPeriod(orgB.organizationId)
    const scope = await ownerScope(orgA)

    // `import_batch_period_fk` carries organization_id, so this is a 23503 at
    // the database rather than a silently-wrong row stamped with a foreign
    // period.
    await expect(
      createDraftBatch(scope, {
        periodId: foreignPeriodId,
        dataset: "vzz",
        source: "agent",
        statementLines: VZZ_LINES,
      }),
    ).rejects.toThrow()
  })

  it("rolls the whole draft back when one row is bad", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    await expect(
      createDraftBatch(scope, {
        periodId,
        dataset: "rozvaha",
        source: "agent",
        statementLines: [
          ROZVAHA_LINES[0],
          // Same řádek of the same statement — `statement_line_identity_unique`
          // refuses it, and the batch row must go with it. A half-written
          // rozvaha the office could publish is worse than no rozvaha.
          { ...ROZVAHA_LINES[0], rowLabel: "duplikát" },
        ],
      }),
    ).rejects.toThrow()

    const history = await batchHistoryForScope(scope, { periodId })
    expect(history).toHaveLength(0)
  })
})

describe("publishBatch — the flip", () => {
  it("publishes a draft and stamps it", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "manual",
      filename: "predvaha-2026-07.csv",
      trialBalanceLines: PREDVAHA_LINES,
    })

    const outcome = await publishBatch(scope, batch.id)
    expect(outcome).toEqual({
      ok: true,
      batchId: batch.id,
      supersededBatchId: null,
      alreadyPublished: false,
    })

    const published = await publishedBatchFor(scope, {
      periodId,
      dataset: "predvaha",
    })
    expect(published?.id).toBe(batch.id)
    expect(published?.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(published?.filename).toBe("predvaha-2026-07.csv")
  })

  it("is idempotent — re-publishing the same batch changes nothing", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    const first = await publishBatch(scope, batch.id)
    const stamp = (await readImportBatchRow(batch.id)).published_at

    // PR 24's agent retries a request whose response it never saw. The second
    // call must not re-stamp the batch, or the §0.4 freshness date would move
    // for an import that did not happen.
    const second = await publishBatch(scope, batch.id)

    expect(first).toMatchObject({ ok: true, alreadyPublished: false })
    expect(second).toEqual({
      ok: true,
      batchId: batch.id,
      supersededBatchId: null,
      alreadyPublished: true,
    })
    expect((await readImportBatchRow(batch.id)).published_at).toEqual(stamp)
  })

  it("supersedes the incumbent, and records which batch replaced it", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const first = await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })
    await publishBatch(scope, first.id)

    const second = await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES.map((line) => ({
        ...line,
        minule: line.minule ?? null,
      })),
    })
    const outcome = await publishBatch(scope, second.id)

    expect(outcome).toEqual({
      ok: true,
      batchId: second.id,
      supersededBatchId: first.id,
      alreadyPublished: false,
    })

    const older = await readImportBatchRow(first.id)
    expect(older.status).toBe("superseded")
    expect(older.superseded_by_batch_id).toBe(second.id)
    expect(older.superseded_at).not.toBeNull()
    // The supersession does NOT erase the publication it replaced — that is
    // what makes rollback possible and what the history view renders.
    expect(older.published_at).not.toBeNull()

    const current = await publishedBatchFor(scope, {
      periodId,
      dataset: "rozvaha",
    })
    expect(current?.id).toBe(second.id)
  })

  it("refuses to re-publish a batch that has already been superseded", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const first = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, first.id)
    const second = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, second.id)

    // Putting an old batch back is a ROLLBACK, which spec §3.2 gives its own
    // operation and its own button. Silently doing it here would let a stale
    // retry undo a correction.
    expect(await publishBatch(scope, first.id)).toEqual(
      refused("already_superseded"),
    )
  })

  it("answers unknown_batch for another organization's batch", async () => {
    const foreignPeriodId = await createMonthPeriod(orgB.organizationId)
    const foreignBatch = await createImportBatchRow(
      orgB.organizationId,
      foreignPeriodId,
    )

    const scope = await ownerScope(orgA)
    // Not "forbidden": nothing distinguishes "not yours" from "not there", for
    // the same reason `requireScope` answers 404 six ways.
    expect(await publishBatch(scope, foreignBatch)).toEqual(
      refused("unknown_batch"),
    )
  })

  /**
   * THE CONCURRENCY PROOF (spec §3.2 "atomic transaction").
   *
   * Two publishes of DIFFERENT batches for the same key, fired together. The
   * period row lock serialises them; the partial unique index is the floor
   * under the lock. Whatever the interleaving, the end state is exactly one
   * published batch — never two, never zero.
   *
   * `betaDb()` pools ten connections, so the two transactions genuinely run on
   * two separate backends: the second blocks on the first's row lock rather
   * than on a shared client. (The lockless race, straight at the index, is
   * proved from two explicit connections in `db/import-spine.test.ts`.)
   */
  it("resolves two concurrent publishes of different batches to one published", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const [first, second] = await Promise.all([
      createDraftBatch(scope, {
        periodId,
        dataset: "rozvaha",
        source: "agent",
        statementLines: ROZVAHA_LINES,
      }),
      createDraftBatch(scope, {
        periodId,
        dataset: "rozvaha",
        source: "agent",
        statementLines: ROZVAHA_LINES,
      }),
    ])

    const outcomes = await Promise.all([
      publishBatch(scope, first.id),
      publishBatch(scope, second.id),
    ])

    // Both calls succeed. Both imports were real, and the later one is the
    // newer truth — there is no version of this that should be an error.
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true)

    const history = await batchHistoryForScope(scope, {
      periodId,
      dataset: "rozvaha",
    })
    const published = history.filter((batch) => batch.status === "published")
    const superseded = history.filter((batch) => batch.status === "superseded")

    expect(published).toHaveLength(1)
    expect(superseded).toHaveLength(1)
    // The supersession chain records which one lost, so the office can roll
    // back to it.
    expect(superseded[0]!.supersededByBatchId).toBe(published[0]!.id)
  })

  it("resolves two concurrent publishes of the SAME batch to one stamp", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: PREDVAHA_LINES,
    })

    const outcomes = await Promise.all([
      publishBatch(scope, batch.id),
      publishBatch(scope, batch.id),
    ])

    // Exactly one call did the work; the other found it already done.
    expect(outcomes.filter((o) => o.ok && !o.alreadyPublished)).toHaveLength(1)
    expect(outcomes.filter((o) => o.ok && o.alreadyPublished)).toHaveLength(1)

    const history = await batchHistoryForScope(scope, { periodId })
    expect(history.filter((b) => b.status === "published")).toHaveLength(1)
  })
})

describe("rollbackDataset — Vrátit poslední import", () => {
  it("puts the predecessor back and returns the current batch to draft", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const first = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, first.id)
    const second = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, second.id)

    const outcome = await rollbackDataset(scope, { periodId, dataset: "vzz" })
    expect(outcome).toEqual({
      ok: true,
      unpublishedBatchId: second.id,
      restoredBatchId: first.id,
    })

    const current = await publishedBatchFor(scope, { periodId, dataset: "vzz" })
    expect(current?.id).toBe(first.id)

    const restored = await readImportBatchRow(first.id)
    expect(restored.status).toBe("published")
    expect(restored.superseded_at).toBeNull()
    expect(restored.superseded_by_batch_id).toBeNull()

    // Back to `draft`, not to `superseded`: nothing supersedes it any more, and
    // a superseded row with no superseder would violate the coherence CHECK.
    // Being a draft also means the office can simply publish it again if the
    // rollback was the mistake.
    const undone = await readImportBatchRow(second.id)
    expect(undone.status).toBe("draft")
    expect(undone.published_at).toBeNull()
  })

  it("is reversible — republishing after a rollback restores the chain", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const first = await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })
    await publishBatch(scope, first.id)
    const second = await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })
    await publishBatch(scope, second.id)
    await rollbackDataset(scope, { periodId, dataset: "rozvaha" })

    expect(await publishBatch(scope, second.id)).toEqual({
      ok: true,
      batchId: second.id,
      supersededBatchId: first.id,
      alreadyPublished: false,
    })
    const current = await publishedBatchFor(scope, {
      periodId,
      dataset: "rozvaha",
    })
    expect(current?.id).toBe(second.id)
  })

  it("leaves the dataset unpublished when there was no predecessor", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const only = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: PREDVAHA_LINES,
    })
    await publishBatch(scope, only.id)

    const outcome = await rollbackDataset(scope, {
      periodId,
      dataset: "predvaha",
    })
    expect(outcome).toEqual({
      ok: true,
      unpublishedBatchId: only.id,
      restoredBatchId: null,
    })

    // §0.4: the honest answer is that nothing is published, not an older
    // period's numbers dressed up as this one's.
    expect(
      await publishedBatchFor(scope, { periodId, dataset: "predvaha" }),
    ).toBeNull()
  })

  it("refuses when the dataset has nothing published", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    expect(await rollbackDataset(scope, { periodId, dataset: "vzz" })).toEqual({
      ok: false,
      reason: "nothing_published",
    })
  })
})

describe("deleteDraftBatch", () => {
  it("discards a draft and its rows", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: PREDVAHA_LINES,
    })

    expect(await deleteDraftBatch(scope, batch.id)).toBe(true)
    expect(await batchHistoryForScope(scope, { periodId })).toHaveLength(0)
    expect(await trialBalanceLinesForBatch(scope, batch.id)).toEqual([])
  })

  it("refuses a published or superseded batch", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const first = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, first.id)
    const second = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, second.id)

    // A published batch is what a client has been looking at; a superseded one
    // is the record of what they were looking at before. Neither is this
    // product's to remove.
    expect(await deleteDraftBatch(scope, second.id)).toBe(false)
    expect(await deleteDraftBatch(scope, first.id)).toBe(false)
  })

  it("cannot reach another organization's draft", async () => {
    const foreignPeriodId = await createMonthPeriod(orgB.organizationId)
    const foreignBatch = await createImportBatchRow(
      orgB.organizationId,
      foreignPeriodId,
    )
    const scope = await ownerScope(orgA)
    expect(await deleteDraftBatch(scope, foreignBatch)).toBe(false)
  })
})

describe("reads — drafts are never served, and never leak", () => {
  it("never returns a draft from publishedBatchFor", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })

    // Even for the owner, who staged it. "Published" is a fact about the batch,
    // not about the reader.
    expect(
      await publishedBatchFor(scope, { periodId, dataset: "rozvaha" }),
    ).toBeNull()
  })

  it("hides drafts from every role but the owner", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const owner = await ownerScope(org)

    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })

    expect(await batchHistoryForScope(owner, { periodId })).toHaveLength(1)
    expect(await statementLinesForBatch(owner, draft.id)).toHaveLength(3)

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const scope = await requireScope(org.slug)
      // The office has to be able to stage a correction without the client
      // watching it happen.
      expect(
        await batchHistoryForScope(scope, { periodId }),
        `${role} sees no draft in the history`,
      ).toHaveLength(0)
      expect(
        await statementLinesForBatch(scope, draft.id),
        `${role} reads no draft rows`,
      ).toEqual([])
    }
  })

  it("shows the published history to every role, guest included", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const owner = await ownerScope(org)

    const batch = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(owner, batch.id)

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const scope = await requireScope(org.slug)
      // §5: guest is an external VIEWER of client-visible data, not a blinded
      // one. The restrictions bite at the write surfaces.
      expect(
        await batchHistoryForScope(scope, { periodId }),
        `${role} reads the history`,
      ).toHaveLength(1)
      expect(
        await statementLinesForBatch(scope, batch.id),
        `${role} reads the rows`,
      ).toHaveLength(2)
    }
  })

  it("returns only the scope's own batches", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const foreignPeriodId = await createMonthPeriod(foreign.organizationId)

    const mine = await createImportBatchRow(org.organizationId, periodId, {
      status: "published",
    })
    await createImportBatchRow(foreign.organizationId, foreignPeriodId, {
      status: "published",
    })

    as(org.members.admin.headers)
    const history = await batchHistoryForScope(await requireScope(org.slug))
    expect(history.map((batch) => batch.id)).toEqual([mine])
  })

  it("cannot be pointed at another organization — the handle is the only input", async () => {
    as(orgA.members.member.headers)
    await expect404(
      () => requireScope(orgB.slug),
      "A's member must not resolve B",
    )
  })

  it("returns nothing for a batch id from another organization", async () => {
    const foreignPeriodId = await createMonthPeriod(orgB.organizationId)
    const foreignBatch = await createImportBatchRow(
      orgB.organizationId,
      foreignPeriodId,
      { dataset: "predvaha", status: "published" },
    )
    await createTrialBalanceLineRow(
      orgB.organizationId,
      foreignBatch,
      foreignPeriodId,
    ).catch(() => null)

    const scope = await ownerScope(orgA)
    expect(await trialBalanceLinesForBatch(scope, foreignBatch)).toEqual([])
    expect(await statementLinesForBatch(scope, foreignBatch)).toEqual([])
  })
})

describe("projections — statutory fidelity and money as text", () => {
  it("round-trips all five rozvaha columns without touching a number", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })
    await publishBatch(scope, batch.id)

    const lines = await statementLinesForBatch(scope, batch.id)

    expect(lines[0]).toEqual({
      id: expect.any(String),
      statementKind: "rozvaha_aktiva",
      ozn: "",
      rowCode: "001",
      rowLabel: "AKTIVA CELKEM",
      indent: 0,
      isBold: true,
      brutto: "5120000.00",
      korekce: "-1230000.50",
      // STORED, not derived. brutto − korekce happens to agree here; the point
      // is that this application never checked, because the office's software
      // is the authority on the printed netto (spec §0.2).
      netto: "3889999.50",
      bezne: null,
      minule: "4010500.25",
    })
    // Absent is absent — not zero (§0.4).
    expect(lines[1]!.minule).toBeNull()
    // Pasiva is a two-column statement.
    expect(lines[2]).toMatchObject({
      statementKind: "rozvaha_pasiva",
      brutto: null,
      korekce: null,
      netto: null,
      bezne: "3889999.50",
      minule: "4010500.25",
    })
    // Every value is a STRING all the way out. Parsing one into a JavaScript
    // number is how a haléř goes missing from a statutory statement.
    for (const line of lines) {
      for (const value of [
        line.brutto,
        line.korekce,
        line.netto,
        line.bezne,
        line.minule,
      ]) {
        expect(value === null || typeof value === "string").toBe(true)
      }
    }
  })

  it("round-trips a VZZ, including a negative výsledek hospodaření", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, batch.id)

    const lines = await statementLinesForBatch(scope, batch.id, {
      statementKind: "vzz",
    })
    expect(
      lines.map((line) => [line.rowCode, line.bezne, line.minule]),
    ).toEqual([
      ["001", "8400000.00", "7250000.00"],
      ["057", "-125400.75", "310200.00"],
    ])
  })

  it("round-trips a předvaha's opening, MD/D turnovers and closing", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: PREDVAHA_LINES,
    })
    await publishBatch(scope, batch.id)

    const lines = await trialBalanceLinesForBatch(scope, batch.id)
    expect(lines).toEqual([
      {
        id: expect.any(String),
        accountCode: "211",
        accountName: "Pokladna",
        openingBalance: "35000.00",
        turnoverDebit: "120000.00",
        turnoverCredit: "-98500.50",
        closingBalance: "56499.50",
      },
      {
        id: expect.any(String),
        accountCode: "221100",
        accountName: "Bankovní účet CZK",
        openingBalance: "1250000.00",
        turnoverDebit: "890450.75",
        turnoverCredit: "-12000.25",
        closingBalance: "2128450.50",
      },
    ])
  })

  it("carries no forbidden column into a client-visible shape", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "manual",
      filename: "predvaha.csv",
      sha256: "a".repeat(64),
      mapping: { ucet: "A", nazev: "B" },
      noteInternal: "Znovu naimportováno — chyběly analytiky.",
      trialBalanceLines: PREDVAHA_LINES,
    })
    await publishBatch(scope, batch.id)

    const history = await batchHistoryForScope(scope, { periodId })
    const lines = await trialBalanceLinesForBatch(scope, batch.id)
    const freshness = await datasetFreshnessForScope(scope)

    // `sha256` and `note_internal` are on CLIENT_FORBIDDEN_COLUMNS; `mapping`
    // and both user ids are simply never selected.
    expect(forbiddenClientKeys({ history, lines, freshness })).toEqual([])
    expect(JSON.stringify(history)).not.toContain("Znovu naimportováno")
    expect(JSON.stringify(history)).not.toContain("a".repeat(64))
    expect(JSON.stringify(history)).not.toContain("ucet")
  })
})

describe("datasetFreshnessForScope — the §0.4 contract", () => {
  it("reports every dataset, including the ones with no payload table yet", async () => {
    const org = await seedOrganization()
    const scope = await ownerScope(org)

    const freshness = await datasetFreshnessForScope(scope)

    expect(freshness.map((row) => row.dataset)).toEqual(
      IMPORT_DATASETS.map((row) => row.dataset),
    )
    // "Empty beats stale": a dataset the office has never sent has no as-of
    // date at all, so the surface renders "zatím nebylo nahráno" rather than
    // reaching for an older period.
    expect(freshness.every((row) => row.publishedAt === null)).toBe(true)
    expect(freshness.every((row) => row.period === null)).toBe(true)
    expect(
      freshness.filter((row) => !row.implemented).map((row) => row.dataset),
    ).toEqual(["saldokonto", "payroll"])
  })

  it("stamps each dataset with its own newest published period", async () => {
    const org = await seedOrganization()
    const scope = await ownerScope(org)
    const june = await createReportingPeriod(org.organizationId, {
      kind: "month",
      year: 2026,
      month: 6,
    })
    const july = await createReportingPeriod(org.organizationId, {
      kind: "month",
      year: 2026,
      month: 7,
    })

    // Rozvaha is current; the předvaha stopped in June. That per-dataset
    // divergence is exactly what §0.4 exists to make visible.
    for (const [periodId, dataset] of [
      [june, "rozvaha"] as const,
      [july, "rozvaha"] as const,
      [june, "predvaha"] as const,
    ]) {
      const batch =
        dataset === "rozvaha"
          ? await createDraftBatch(scope, {
              periodId,
              dataset,
              source: "agent",
              statementLines: ROZVAHA_LINES,
            })
          : await createDraftBatch(scope, {
              periodId,
              dataset,
              source: "agent",
              trialBalanceLines: PREDVAHA_LINES,
            })
      await publishBatch(scope, batch.id)
    }

    const freshness = await datasetFreshnessForScope(scope)
    const byDataset = new Map(freshness.map((row) => [row.dataset, row]))

    expect(byDataset.get("rozvaha")).toMatchObject({
      implemented: true,
      rowCount: 3,
    })
    expect(byDataset.get("rozvaha")!.period).toMatchObject({
      year: 2026,
      month: 7,
    })
    expect(byDataset.get("predvaha")!.period).toMatchObject({
      year: 2026,
      month: 6,
    })
    expect(byDataset.get("vzz")!.publishedAt).toBeNull()
  })

  it("clears a dataset's stamp when its only publication is rolled back", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const scope = await ownerScope(org)

    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, batch.id)
    expect(
      (await datasetFreshnessForScope(scope)).find(
        (row) => row.dataset === "vzz",
      )?.publishedAt,
    ).not.toBeNull()

    await rollbackDataset(scope, { periodId, dataset: "vzz" })

    // The stamp goes with the publication. A rollback that left `published_at`
    // behind would keep the surface claiming an as-of date for an import
    // nobody can see any more — the exact confidently-wrong failure §0.4 is
    // written against.
    expect(
      (await datasetFreshnessForScope(scope)).find(
        (row) => row.dataset === "vzz",
      )?.publishedAt,
    ).toBeNull()
  })
})
