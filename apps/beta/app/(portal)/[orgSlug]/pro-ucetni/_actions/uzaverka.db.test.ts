/**
 * Měsíční uzávěrka's four Server Actions, driven as the POSTs they are.
 *
 * A SERVER ACTION IS A PUBLIC ENDPOINT — generated name, reachable without ever
 * rendering the page that holds its form, and it does NOT run
 * `pro-ucetni/layout.tsx`'s owner gate. `lib/data/imports.test.ts` proves the
 * DATA layer refuses a non-owner handle; this file proves the ACTIONS never
 * obtain one, for every role, on every action, with a real `FormData` and a
 * real session. The cross-org case is the other half: an owner of A POSTing
 * B's slug must get B's answer (404), not A's authority.
 *
 * AND IT PROVES THE LOOP CLOSES. Publish, rollback and the CSV fallback are
 * only correct if their EFFECT is what a client sees — so each one is asserted
 * through `publishedBatchFor`, the same read the client Výkazy pages make,
 * rather than through the action's own return value.
 *
 * `revalidatePath` is mocked away (Next's request-scoped cache API, which
 * throws outside a render). `redirect` is NOT: the upload action's redirect to
 * the new draft's preview is part of its contract, so it is caught and read.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { BetaOrgRole } from "@/db/schema"
import {
  createMonthPeriod,
  endFixtures,
  readImportBatchRow,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"
import type { StatementLineInput } from "@/lib/data/imports"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const actions = await import("./uzaverka")
const { requireOwner, requireScope } = await import("@/lib/data/scope")
const {
  createDraftBatch,
  officeBatchHistoryFor,
  publishBatch,
  publishedBatchFor,
  statementLinesForBatch,
  trialBalanceLinesForBatch,
} = await import("@/lib/data/imports")
const { reportingPeriodsForScope } =
  await import("@/lib/data/reporting-periods")

const IDLE = { status: "idle" } as const
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

function fd(entries: Record<string, string | File>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

function csv(name: string, text: string): File {
  return new File([text], name, { type: "text/csv" })
}

async function ownerScope(org: TestOrganization) {
  as(org.members.owner.headers)
  return requireOwner(await requireScope(org.slug))
}

async function expect404(
  run: () => Promise<unknown>,
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

/** Run a redirecting action and return where it sent the caller. */
async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    const digest = String((error as { digest?: unknown }).digest ?? "")
    expect(digest.startsWith("NEXT_REDIRECT"), digest).toBe(true)
    return digest
  }
  throw new Error("expected the action to redirect")
}

const VZZ_LINES = [
  {
    statementKind: "vzz" as const,
    ozn: "***",
    rowCode: "057",
    rowLabel: "Výsledek hospodaření za účetní období",
    sortOrder: 1,
    bezne: "-125400.75",
  },
] as const satisfies readonly StatementLineInput[]

const PREDVAHA_CSV = [
  "﻿Účet;Název;Počáteční stav;Obrat MD;Obrat Dal;Konečný zůstatek",
  "211;Pokladna;12 000,00;3 500,50;1 200,00;14 300,50",
  '311;"Odběratelé; tuzemsko";0,00;250 000,00;180 000,00;70 000,00',
  "",
].join("\r\n")

const ROZVAHA_CSV = [
  "Část;Ozn;Řádek;Text;Brutto;Korekce;Netto;Běžné;Minulé;Tučné",
  "aktiva;;001;AKTIVA CELKEM;5 000 000,00;-1 200 000,00;3 800 000,00;;3 500 000,00;ano",
  "pasiva;A.;079;Vlastní kapitál;;;;1 800 000,00;1 600 000,00;ano",
  "",
].join("\n")

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("authz — every action is owner-only, in every organization", () => {
  const nonOwners: BetaOrgRole[] = ["admin", "member", "guest"]

  it("refuses publish, rollback and discard for every non-owner role", async () => {
    const owner = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)
    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })

    for (const role of nonOwners) {
      as(org.members[role].headers)
      await expect404(
        () =>
          actions.publishBatchAction(
            IDLE,
            fd({ orgSlug: org.slug, batchId: draft.id }),
          ),
        `${role} must not publish`,
      )
      await expect404(
        () =>
          actions.rollbackDatasetAction(
            IDLE,
            fd({ orgSlug: org.slug, periodId, dataset: "vzz" }),
          ),
        `${role} must not roll back`,
      )
      await expect404(
        () =>
          actions.discardDraftAction(
            IDLE,
            fd({ orgSlug: org.slug, batchId: draft.id }),
          ),
        `${role} must not discard`,
      )
    }

    // Nothing happened: the draft is still a draft.
    expect((await readImportBatchRow(draft.id)).status).toBe("draft")
  })

  it("refuses the CSV upload for every non-owner role", async () => {
    for (const role of nonOwners) {
      as(org.members[role].headers)
      await expect404(
        () =>
          actions.uploadCsvBatchAction(
            IDLE,
            fd({
              orgSlug: org.slug,
              dataset: "predvaha",
              periodKind: "month",
              year: "2026",
              month: "7",
              file: csv("predvaha.csv", PREDVAHA_CSV),
            }),
          ),
        `${role} must not import`,
      )
    }
  })

  it("refuses an owner of a DIFFERENT organization", async () => {
    const other = await seedOrganization()
    const otherOwner = await ownerScope(other)
    const otherPeriod = await createMonthPeriod(other.organizationId)
    const otherDraft = await createDraftBatch(otherOwner, {
      periodId: otherPeriod,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })

    // org's owner, posting `other`'s slug — the slug decides, not the session.
    as(org.members.owner.headers)
    await expect404(
      () =>
        actions.publishBatchAction(
          IDLE,
          fd({ orgSlug: other.slug, batchId: otherDraft.id }),
        ),
      "an owner elsewhere is not an owner here",
    )
    expect((await readImportBatchRow(otherDraft.id)).status).toBe("draft")
  })

  it("cannot publish another organization's batch by posting its own slug", async () => {
    const other = await seedOrganization()
    const otherOwner = await ownerScope(other)
    const otherPeriod = await createMonthPeriod(other.organizationId)
    const otherDraft = await createDraftBatch(otherOwner, {
      periodId: otherPeriod,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })

    const owner = await ownerScope(org)
    const result = await actions.publishBatchAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId: otherDraft.id }),
    )

    // The tenancy filter is in the WHERE clause, so a foreign id is simply not
    // there — the same non-oracle answer everywhere else in this app.
    expect(result).toEqual({
      status: "error",
      error: "uzaverka.errorUnknownBatch",
    })
    expect((await readImportBatchRow(otherDraft.id)).status).toBe("draft")
    void owner
  })
})

describe("publish and rollback — the effect a client sees", () => {
  it("publishes a draft and the client read starts serving it", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)
    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })

    expect(
      await publishedBatchFor(owner, { periodId, dataset: "vzz" }),
    ).toBeNull()

    const result = await actions.publishBatchAction(
      IDLE,
      fd({ orgSlug: fresh.slug, batchId: draft.id }),
    )
    expect(result).toEqual({ status: "ok", message: "uzaverka.okPublished" })

    as(fresh.members.member.headers)
    const clientScope = await requireScope(fresh.slug)
    const live = await publishedBatchFor(clientScope, {
      periodId,
      dataset: "vzz",
    })
    expect(live?.id).toBe(draft.id)
    expect(
      (await statementLinesForBatch(clientScope, live!.id)).map(
        (line) => line.bezne,
      ),
    ).toEqual(["-125400.75"])
  })

  it("reports a publish that replaced a predecessor apart from a first one", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)

    const first = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await actions.publishBatchAction(
      IDLE,
      fd({ orgSlug: fresh.slug, batchId: first.id }),
    )

    const second = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "manual",
      filename: "oprava.csv",
      statementLines: VZZ_LINES,
    })
    expect(
      await actions.publishBatchAction(
        IDLE,
        fd({ orgSlug: fresh.slug, batchId: second.id }),
      ),
    ).toEqual({ status: "ok", message: "uzaverka.okPublishedOver" })

    // Re-publishing what is already live is idempotent, and reported as a
    // success — telling the office it failed would invite a second, real one.
    expect(
      await actions.publishBatchAction(
        IDLE,
        fd({ orgSlug: fresh.slug, batchId: second.id }),
      ),
    ).toEqual({ status: "ok", message: "uzaverka.okAlreadyPublished" })

    // Re-publishing the SUPERSEDED one is not a publish; it is a rollback.
    expect(
      await actions.publishBatchAction(
        IDLE,
        fd({ orgSlug: fresh.slug, batchId: first.id }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorAlreadySuperseded" })
  })

  it("rolls back to the predecessor, and the client read follows", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)

    const first = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(owner, first.id)
    const second = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "manual",
      filename: "oprava.csv",
      statementLines: VZZ_LINES,
    })
    await publishBatch(owner, second.id)

    expect(
      await actions.rollbackDatasetAction(
        IDLE,
        fd({ orgSlug: fresh.slug, periodId, dataset: "vzz" }),
      ),
    ).toEqual({ status: "ok", message: "uzaverka.okRolledBack" })

    as(fresh.members.guest.headers)
    const clientScope = await requireScope(fresh.slug)
    expect(
      (await publishedBatchFor(clientScope, { periodId, dataset: "vzz" }))?.id,
    ).toBe(first.id)
  })

  it("says so when a rollback leaves the client with nothing", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)
    const only = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(owner, only.id)

    expect(
      await actions.rollbackDatasetAction(
        IDLE,
        fd({ orgSlug: fresh.slug, periodId, dataset: "vzz" }),
      ),
    ).toEqual({ status: "ok", message: "uzaverka.okRolledBackToEmpty" })

    as(fresh.members.member.headers)
    const clientScope = await requireScope(fresh.slug)
    expect(
      await publishedBatchFor(clientScope, { periodId, dataset: "vzz" }),
    ).toBeNull()

    // Nothing to roll back a second time.
    await ownerScope(fresh)
    expect(
      await actions.rollbackDatasetAction(
        IDLE,
        fd({ orgSlug: fresh.slug, periodId, dataset: "vzz" }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorNothingPublished" })
  })

  it("discards a draft and refuses to discard anything else", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)
    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    const live = await createDraftBatch(owner, {
      periodId,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: [{ accountCode: "211", accountName: "Pokladna" }],
    })
    await publishBatch(owner, live.id)

    expect(
      await actions.discardDraftAction(
        IDLE,
        fd({ orgSlug: fresh.slug, batchId: draft.id }),
      ),
    ).toEqual({ status: "ok", message: "uzaverka.okDiscarded" })

    // A published batch is what a client has been looking at — not this
    // product's to remove.
    expect(
      await actions.discardDraftAction(
        IDLE,
        fd({ orgSlug: fresh.slug, batchId: live.id }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorUnknownBatch" })
    expect((await readImportBatchRow(live.id)).status).toBe("published")
  })

  it("refuses a malformed id as an ordinary error, not a 500", async () => {
    const fresh = await seedOrganization()
    await ownerScope(fresh)

    expect(
      await actions.publishBatchAction(
        IDLE,
        fd({ orgSlug: fresh.slug, batchId: "not-a-uuid" }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorInvalidInput" })
    expect(
      await actions.rollbackDatasetAction(
        IDLE,
        fd({ orgSlug: fresh.slug, periodId: "nope", dataset: "vzz" }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorInvalidInput" })
  })
})

describe("the manual CSV fallback — file to draft to published", () => {
  it("imports a Czech předvaha export, creates its period, and redirects to the preview", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)

    const digest = await expectRedirect(() =>
      actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "predvaha",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: csv("predvaha-07-2026.csv", PREDVAHA_CSV),
        }),
      ),
    )
    expect(digest).toContain(`/${fresh.slug}/pro-ucetni/uzaverka/`)

    // The period the file named did not exist before the upload.
    const periods = await reportingPeriodsForScope(owner, { kind: "month" })
    expect(periods.map((period) => period.month)).toContain(7)

    const history = await officeBatchHistoryFor(owner, { dataset: "predvaha" })
    expect(history).toHaveLength(1)
    const draft = history[0]!
    expect(draft.status).toBe("draft")
    expect(draft.source).toBe("manual")
    expect(draft.filename).toBe("predvaha-07-2026.csv")
    expect(draft.rowCount).toBe(2)

    // The rows are stored verbatim — BOM stripped, decimal comma normalised,
    // the quoted semicolon kept inside the name.
    const lines = await trialBalanceLinesForBatch(owner, draft.id)
    expect(lines.map((line) => line.accountCode)).toEqual(["211", "311"])
    expect(lines[0]?.closingBalance).toBe("14300.50")
    expect(lines[1]?.accountName).toBe("Odběratelé; tuzemsko")

    // A DRAFT is invisible to the client until it is published…
    as(fresh.members.member.headers)
    const clientScope = await requireScope(fresh.slug)
    expect(
      await publishedBatchFor(clientScope, {
        periodId: draft.period.id,
        dataset: "predvaha",
      }),
    ).toBeNull()

    // …and publishing goes through the ordinary path.
    await ownerScope(fresh)
    expect(
      await actions.publishBatchAction(
        IDLE,
        fd({ orgSlug: fresh.slug, batchId: draft.id }),
      ),
    ).toEqual({ status: "ok", message: "uzaverka.okPublished" })

    as(fresh.members.member.headers)
    const live = await publishedBatchFor(await requireScope(fresh.slug), {
      periodId: draft.period.id,
      dataset: "predvaha",
    })
    expect(live?.id).toBe(draft.id)
  })

  it("imports a rozvaha, splitting aktiva and pasiva into their own kinds", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)

    await expectRedirect(() =>
      actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "rozvaha",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: csv("rozvaha.csv", ROZVAHA_CSV),
        }),
      ),
    )

    const [draft] = await officeBatchHistoryFor(owner, { dataset: "rozvaha" })
    const aktiva = await statementLinesForBatch(owner, draft!.id, {
      statementKind: "rozvaha_aktiva",
    })
    const pasiva = await statementLinesForBatch(owner, draft!.id, {
      statementKind: "rozvaha_pasiva",
    })

    expect(aktiva).toHaveLength(1)
    expect(aktiva[0]).toMatchObject({
      rowCode: "001",
      brutto: "5000000.00",
      korekce: "-1200000.00",
      netto: "3800000.00",
      bezne: null,
      isBold: true,
    })
    expect(pasiva[0]).toMatchObject({
      ozn: "A.",
      bezne: "1800000.00",
      brutto: null,
    })
  })

  it("refuses a file with bad rows, naming every line, and writes nothing", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)

    const result = await actions.uploadCsvBatchAction(
      IDLE,
      fd({
        orgSlug: fresh.slug,
        dataset: "predvaha",
        periodKind: "month",
        year: "2026",
        month: "7",
        file: csv(
          "spatna.csv",
          [
            "Účet;Název;Konečný zůstatek",
            "211;Pokladna;12 000,00",
            "311;Odběratelé;x",
            ";Bez účtu;10,00",
            "",
          ].join("\n"),
        ),
      }),
    )

    expect(result).toMatchObject({
      status: "csv_rejected",
      error: "uzaverka.csvErrorRowIssues",
      hiddenIssues: 0,
    })
    expect(
      (result as { issues: readonly { line: number }[] }).issues.map(
        (issue) => issue.line,
      ),
    ).toEqual([3, 4])
    // Not one row imported, and not even a period created.
    expect(await officeBatchHistoryFor(owner)).toEqual([])
  })

  it("names the missing columns when the wrong export was picked", async () => {
    const fresh = await seedOrganization()
    await ownerScope(fresh)

    expect(
      await actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "predvaha",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: csv("saldokonto.csv", "Partner;Saldo\nACME s.r.o.;125000,00\n"),
        }),
      ),
    ).toEqual({
      status: "csv_rejected",
      error: "uzaverka.csvErrorMissingColumns",
      missingColumns: ["Účet", "Název"],
      issues: [],
      hiddenIssues: 0,
    })
  })

  it("reports a structural refusal with its own message", async () => {
    const fresh = await seedOrganization()
    await ownerScope(fresh)

    const upload = (text: string) =>
      actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "predvaha",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: csv("x.csv", text),
        }),
      )

    expect(await upload("Účet;Název\n")).toEqual({
      status: "error",
      error: "uzaverka.csvErrorNoDataRows",
    })
    expect(await upload('Účet;Název\n211;"Pokladna\n')).toEqual({
      status: "error",
      error: "uzaverka.csvErrorUnterminatedQuote",
    })
  })

  it("refuses an oversize file before it is read into memory", async () => {
    const fresh = await seedOrganization()
    await ownerScope(fresh)

    const huge = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "huge.csv", {
      type: "text/csv",
    })
    expect(
      await actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "predvaha",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: huge,
        }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorFileTooLarge" })
  })

  it("refuses a file that is not UTF-8 rather than importing mojibake", async () => {
    const fresh = await seedOrganization()
    await ownerScope(fresh)

    // "Účet;Název" as Windows-1250, the other encoding a Czech export offers.
    const cp1250 = new Uint8Array([
      0xdd, 0xe8, 0x65, 0x74, 0x3b, 0x4e, 0xe1, 0x7a, 0x65, 0x76, 0x0a, 0x32,
      0x31, 0x31, 0x3b, 0x50, 0x6f, 0x6b, 0x6c, 0x61, 0x64, 0x6e, 0x61, 0x0a,
    ])
    expect(
      await actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "predvaha",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: new File([cp1250], "cp1250.csv", { type: "text/csv" }),
        }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorNotUtf8" })
  })

  it("refuses an empty pick, an unknown dataset and a bad period", async () => {
    const fresh = await seedOrganization()
    await ownerScope(fresh)

    expect(
      await actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "predvaha",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: csv("empty.csv", ""),
        }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorNoFile" })

    // `saldokonto` HAS a payload table since PR 28, and the CSV fallback still
    // refuses it: a saldokonto line names a counterparty, and resolving a name
    // into a partner row is the agent's job (`lib/data/partners.ts` holds the
    // match order). A fixed-header CSV cannot state an `external_ref`, so a
    // fallback import would have to guess at identity — which is the one thing
    // the partner registry exists to prevent. `CSV_DATASETS` is the closed list
    // and saldokonto is deliberately not in it.
    expect(
      await actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "saldokonto",
          periodKind: "month",
          year: "2026",
          month: "7",
          file: csv("x.csv", PREDVAHA_CSV),
        }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorInvalidInput" })

    expect(
      await actions.uploadCsvBatchAction(
        IDLE,
        fd({
          orgSlug: fresh.slug,
          dataset: "predvaha",
          periodKind: "month",
          year: "2026",
          month: "13",
          file: csv("x.csv", PREDVAHA_CSV),
        }),
      ),
    ).toEqual({ status: "error", error: "uzaverka.errorPeriodInvalid" })
  })
})
