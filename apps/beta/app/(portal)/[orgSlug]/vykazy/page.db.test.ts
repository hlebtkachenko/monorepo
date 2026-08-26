/**
 * The three client Výkazy pages, rendered against a real Postgres 18.
 *
 * WHAT ONLY A DB TEST CAN SEE HERE. The statutory markup is asserted from
 * fixture rows in `app/_components/statement-table.test.tsx`; what this file
 * proves is the READ contract around it — that a draft never reaches a client
 * page, that the period picker offers only periods that render something, that
 * a rollback puts the empty state back, that the freshness stamp says when and
 * from where, and that another organization's slug answers 404 rather than its
 * numbers.
 *
 * The Server Components are called DIRECTLY as async functions (never as JSX)
 * and their returned trees rendered to a string — the technique
 * `majetek/page.test.ts` documents. `next-intl/server` and
 * `@/i18n/translations-server` are stubbed because both need a Next request
 * context that does not exist in a bare module import; `@/i18n/format-values`
 * and `lib/format/money` are NOT stubbed, because the cs-CZ rendering of a
 * money string is part of what is under test.
 */
import type { ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createMonthPeriod,
  createReportingPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

import type {
  StatementLineInput,
  TrialBalanceLineInput,
} from "@/lib/data/imports"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const { requireOwner, requireScope } = await import("@/lib/data/scope")
const { createDraftBatch, publishBatch, rollbackDataset } =
  await import("@/lib/data/imports")
const RozvahaPage = (await import("./page")).default
const VysledovkaPage = (await import("./vzz/page")).default
const PredvahaPage = (await import("./predvaha/page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

/**
 * Render a resolved page tree to HTML.
 *
 * `renderToReadableStream`, not `renderToStaticMarkup`, and that is forced by
 * the shape of these pages rather than a preference: a page's own `await`s are
 * done by the time it returns, but the tree it returns still CONTAINS async
 * Server Components (`DatasetHeader`, `StatementTable`, …), each of which
 * awaits `getBetaTranslations()`. The synchronous renderer refuses those ("a
 * component suspended while responding to synchronous input"); the streaming
 * one resolves them, and `allReady` is what makes the result a complete
 * document rather than a shell plus fallbacks.
 */
async function render(tree: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(tree)
  await stream.allReady
  return new Response(stream).text()
}

/** Strip the grouping spaces `Intl` emits so an assertion can name a number. */
const digits = (html: string): string => html.replace(/\s/g, "")

async function ownerScope(org: TestOrganization) {
  as(org.members.owner.headers)
  return requireOwner(await requireScope(org.slug))
}

async function expect404(run: () => Promise<unknown>): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest).toBe(NOT_FOUND_DIGEST)
}

const ROZVAHA_LINES = [
  {
    statementKind: "rozvaha_aktiva" as const,
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
    statementKind: "rozvaha_pasiva" as const,
    ozn: "A.",
    rowCode: "079",
    rowLabel: "Vlastní kapitál",
    sortOrder: 2,
    bezne: "1800000.00",
    minule: "1600000.00",
  },
] as const satisfies readonly StatementLineInput[]

const VZZ_LINES = [
  {
    statementKind: "vzz" as const,
    ozn: "***",
    rowCode: "057",
    rowLabel: "Výsledek hospodaření za účetní období",
    sortOrder: 1,
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
    turnoverCredit: "98500.50",
    closingBalance: "56499.50",
  },
  {
    accountCode: "221100",
    accountName: "Bankovní účet CZK",
    openingBalance: "1250000.00",
    turnoverDebit: "890450.75",
    turnoverCredit: "12000.25",
    closingBalance: "2128450.50",
  },
] as const satisfies readonly TrialBalanceLineInput[]

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("Výkazy — Rozvaha", () => {
  it("renders the honest empty state before anything is published", async () => {
    const fresh = await seedOrganization()
    as(fresh.members.admin.headers)

    const html = await render(
      await RozvahaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )

    expect(html).toContain("vykazy.emptyHeading")
    expect(html).toContain("vykazy.emptyRozvaha")
    // No period picker at all, so there is nothing to click into a dead period.
    expect(html).not.toContain("vykazy.periodPickerLabel")
  })

  it("renders both sides of a published batch with the freshness stamp", async () => {
    const scope = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)
    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "agent",
      statementLines: ROZVAHA_LINES,
    })
    await publishBatch(scope, batch.id)

    as(org.members.member.headers)
    const html = await render(
      await RozvahaPage({
        params: Promise.resolve({ orgSlug: org.slug }),
        searchParams: Promise.resolve({}),
      }),
    )

    expect(html).toContain("AKTIVA CELKEM")
    expect(html).toContain("Vlastní kapitál")
    expect(digits(html)).toContain("-1230000,50")
    // §0.4: when, and from where.
    expect(html).toContain("vykazy.publishedAt")
    expect(html).toContain("vykazy.sourceAgent")
    // The top strip is read off published lines, never summed.
    expect(html).toContain("vykazy.highlightBilancniSuma")
    expect(html).toContain("vykazy.highlightVlastniKapital")
    // No Cizí zdroje line in this batch, so no Cizí zdroje tile.
    expect(html).not.toContain("vykazy.highlightCiziZdroje")
  })

  it("never serves a DRAFT to a client page", async () => {
    const fresh = await seedOrganization()
    const scope = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)
    await createDraftBatch(scope, {
      periodId,
      dataset: "rozvaha",
      source: "manual",
      filename: "rozvaha.csv",
      statementLines: ROZVAHA_LINES,
    })

    // Even for the OWNER, who may read the draft through the office surface:
    // the client page asks `publishedBatchFor`, which filters in SQL.
    const html = await render(
      await RozvahaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain("vykazy.emptyRozvaha")
    expect(html).not.toContain("AKTIVA CELKEM")
  })

  it("answers 404 for another organization's slug", async () => {
    const other = await seedOrganization()
    as(org.members.owner.headers)

    await expect404(() =>
      RozvahaPage({
        params: Promise.resolve({ orgSlug: other.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
  })
})

describe("Výkazy — period picker and freshness", () => {
  it("offers only published periods and honours the one requested", async () => {
    const fresh = await seedOrganization()
    const scope = await ownerScope(fresh)

    const may = await createReportingPeriod(fresh.organizationId, {
      kind: "month",
      year: 2026,
      month: 5,
    })
    const july = await createReportingPeriod(fresh.organizationId, {
      kind: "month",
      year: 2026,
      month: 7,
    })
    for (const periodId of [may, july]) {
      const batch = await createDraftBatch(scope, {
        periodId,
        dataset: "vzz",
        source: "agent",
        statementLines: VZZ_LINES,
      })
      await publishBatch(scope, batch.id)
    }
    // June has a DRAFT only — it must not appear as an option.
    const june = await createReportingPeriod(fresh.organizationId, {
      kind: "month",
      year: 2026,
      month: 6,
    })
    await createDraftBatch(scope, {
      periodId: june,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })

    as(fresh.members.guest.headers)
    const html = await render(
      await VysledovkaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )

    expect(html).toContain("07/2026")
    expect(html).toContain("05/2026")
    expect(html).not.toContain("06/2026")
    expect(html).toContain(`obdobi=${july}`)

    // A requested period that IS published renders that period.
    const older = await render(
      await VysledovkaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({ obdobi: may }),
      }),
    )
    expect(older).toContain("vykazy.highlightVysledekHospodareni")
  })

  it("shows the §0.4 staleness band when the office is two periods behind", async () => {
    const fresh = await seedOrganization()
    const scope = await ownerScope(fresh)

    const may = await createReportingPeriod(fresh.organizationId, {
      kind: "month",
      year: 2026,
      month: 5,
    })
    const batch = await createDraftBatch(scope, {
      periodId: may,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, batch.id)

    as(fresh.members.member.headers)
    const oneBehind = await render(
      await VysledovkaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    // Only 05/2026 exists, so nothing is behind anything.
    expect(oneBehind).not.toContain("vykazy.staleBandPrefix")

    // A filing for 07/2026 creates that period: the office is now two months
    // ahead of what it has published, which is what the band is for.
    await createReportingPeriod(fresh.organizationId, {
      kind: "month",
      year: 2026,
      month: 7,
    })
    const twoBehind = await render(
      await VysledovkaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(twoBehind).toContain("vykazy.staleBandPrefix")
    expect(twoBehind).toContain("05/2026")
  })

  it("puts the empty state back after a rollback with no predecessor", async () => {
    const fresh = await seedOrganization()
    const scope = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)
    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(scope, batch.id)

    as(fresh.members.member.headers)
    expect(
      await render(
        await VysledovkaPage({
          params: Promise.resolve({ orgSlug: fresh.slug }),
          searchParams: Promise.resolve({}),
        }),
      ),
    ).toContain("Výsledek hospodaření za účetní období")

    await rollbackDataset(await ownerScope(fresh), { periodId, dataset: "vzz" })

    as(fresh.members.member.headers)
    const after = await render(
      await VysledovkaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(after).toContain("vykazy.emptyVzz")
    expect(after).not.toContain("Výsledek hospodaření za účetní období")
  })
})

describe("Výkazy — Obratová předvaha", () => {
  it("renders every account with its four money columns", async () => {
    const fresh = await seedOrganization()
    const scope = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)
    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "manual",
      filename: "predvaha-07-2026.csv",
      trialBalanceLines: PREDVAHA_LINES,
    })
    await publishBatch(scope, batch.id)

    as(fresh.members.guest.headers)
    const html = await render(
      await PredvahaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )

    expect(html).toContain("Pokladna")
    expect(html).toContain("Bankovní účet CZK")
    expect(digits(html)).toContain("2128450,50")
    // A manual drop names its source, not just its timestamp.
    expect(html).toContain("vykazy.sourceManual")
  })

  it("filters by account code and by name, and says so when nothing matches", async () => {
    const fresh = await seedOrganization()
    const scope = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)
    const batch = await createDraftBatch(scope, {
      periodId,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: PREDVAHA_LINES,
    })
    await publishBatch(scope, batch.id)

    as(fresh.members.member.headers)
    const byCode = await render(
      await PredvahaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({ ucet: "221" }),
      }),
    )
    expect(byCode).toContain("Bankovní účet CZK")
    expect(byCode).not.toContain("Pokladna")

    const byName = await render(
      await PredvahaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({ ucet: "pokladna" }),
      }),
    )
    expect(byName).toContain("Pokladna")
    expect(byName).not.toContain("Bankovní účet CZK")

    const nothing = await render(
      await PredvahaPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({ ucet: "zzz" }),
      }),
    )
    expect(nothing).toContain("vykazy.searchNoMatch")
  })
})
