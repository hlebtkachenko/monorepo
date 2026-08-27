/**
 * Měsíční uzávěrka — the review surface, against a real Postgres 18.
 *
 * TWO THINGS ARE UNDER TEST AND THEY ARE DIFFERENT KINDS OF THING:
 *
 *   1. THE MATRIX SEMANTICS (`loadUzaverka`). Four states per dataset, and the
 *      difference between them is the whole §0.4 point: "we have not built this
 *      feed" (saldokonto, payroll) is not "the office has not sent this month",
 *      and a staged draft is neither. Asserted on the loader, where the states
 *      actually are, rather than through markup.
 *   2. THE GATE (`UzaverkaPage`). Pro účetní is owner-only (§5), and a Server
 *      Component page is reachable by URL — so every non-owner role, and a
 *      cross-organization owner, must get 404 and not a rendered grid.
 *
 * The page render itself is a smoke: the page's own tree carries client
 * components (`CsvUploadForm`, `ConfirmActionForm`) whose behaviour is a
 * browser concern, and what matters here is that the server side composes.
 */
import { createElement, type ReactElement, type ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { BetaOrgRole } from "@/db/schema"
import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { StatementLineInput } from "@/lib/data/imports"
import {
  createImportBatchRow,
  createMonthPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const { requireOwner, requireScope } = await import("@/lib/data/scope")
const { createDraftBatch, publishBatch } = await import("@/lib/data/imports")
const { loadUzaverka } = await import("./_lib/load-uzaverka")
const UzaverkaPage = (await import("./page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

async function ownerScope(org: TestOrganization) {
  as(org.members.owner.headers)
  return requireOwner(await requireScope(org.slug))
}

/**
 * Cast for the same reason `majetek/page.test.ts` does: `@workspace/ui`
 * augments next-intl's global `Messages` type with the MAIN product's catalog,
 * which beta's own shape does not satisfy.
 */
const IntlProvider = NextIntlClientProvider as unknown as (props: {
  locale: string
  messages: unknown
  timeZone: string
  formats: unknown
  children?: ReactNode
}) => ReactElement

async function render(tree: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(
    createElement(
      IntlProvider,
      {
        locale: BETA_LOCALE,
        messages: betaMessages,
        timeZone: BETA_TIME_ZONE,
        formats: betaFormats,
      },
      tree,
    ),
  )
  await stream.allReady
  return new Response(stream).text()
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

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("loadUzaverka — the completeness matrix", () => {
  it("always returns one cell per DECLARED dataset, in enum order", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)

    const view = await loadUzaverka(owner, undefined)
    expect(view.cells.map((cell) => cell.dataset)).toEqual([
      "predvaha",
      "rozvaha",
      "vzz",
      "saldokonto",
      "payroll",
    ])
  })

  it("separates 'not wired' from 'not sent' — the two gaps are different", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    await createMonthPeriod(fresh.organizationId)

    const view = await loadUzaverka(owner, undefined)
    const wired = (dataset: string) =>
      view.cells.find((cell) => cell.dataset === dataset)?.implemented

    // Implemented but empty — the office's gap.
    expect(wired("rozvaha")).toBe(true)
    // PR 28 gave saldokonto its payload table and migration 0016 gave payroll
    // its two, and the matrix started reporting both as the OFFICE's gap rather
    // than the build's WITHOUT this loader changing: a cell reads `implemented`
    // off `IMPORT_DATASETS`, so flipping one flag per dataset was the whole of
    // it. Every cell is wired now; the branch survives for the next dataset.
    expect(wired("saldokonto")).toBe(true)
    expect(wired("payroll")).toBe(true)

    for (const cell of view.cells) {
      expect(cell.published).toBeNull()
      expect(cell.draft).toBeNull()
      expect(cell.batches).toEqual([])
    }
  })

  it("reports published, draft, and both at once for the same dataset", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)

    const first = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })

    const staged = await loadUzaverka(owner, periodId)
    const stagedCell = staged.cells.find((cell) => cell.dataset === "vzz")
    expect(stagedCell?.draft?.id).toBe(first.id)
    expect(stagedCell?.published).toBeNull()

    await publishBatch(owner, first.id)
    const live = await loadUzaverka(owner, periodId)
    const liveCell = live.cells.find((cell) => cell.dataset === "vzz")
    expect(liveCell?.published?.id).toBe(first.id)
    expect(liveCell?.draft).toBeNull()

    // A correction staged OVER a live batch: both must show, or the office
    // thinks the correction was lost.
    const correction = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "manual",
      filename: "oprava.csv",
      statementLines: VZZ_LINES,
    })
    const both = await loadUzaverka(owner, periodId)
    const bothCell = both.cells.find((cell) => cell.dataset === "vzz")
    expect(bothCell?.published?.id).toBe(first.id)
    expect(bothCell?.draft?.id).toBe(correction.id)
    expect(bothCell?.batches).toHaveLength(2)
  })

  it("carries who published, and falls back to nothing for an agent batch", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const periodId = await createMonthPeriod(fresh.organizationId)

    const mine = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: VZZ_LINES,
    })
    await publishBatch(owner, mine.id)
    await createImportBatchRow(fresh.organizationId, periodId, {
      dataset: "rozvaha",
      status: "published",
      source: "agent",
    })

    const view = await loadUzaverka(owner, periodId)
    expect(
      view.cells.find((cell) => cell.dataset === "vzz")?.published
        ?.publishedByName,
    ).toBe("Testovací uživatel")
    expect(
      view.cells.find((cell) => cell.dataset === "rozvaha")?.published
        ?.importedByName,
    ).toBeNull()
  })

  it("defaults to the newest period and honours a requested one", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)
    const older = await createMonthPeriod(fresh.organizationId, 2025)
    const newer = await createMonthPeriod(fresh.organizationId, 2026)

    expect((await loadUzaverka(owner, undefined)).period?.id).toBe(newer)
    expect((await loadUzaverka(owner, older)).period?.id).toBe(older)
    // A foreign or unknown id falls back rather than rendering an empty month.
    expect(
      (await loadUzaverka(owner, "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6")).period
        ?.id,
    ).toBe(newer)
  })

  it("renders a full grid for an organization with no periods at all", async () => {
    const fresh = await seedOrganization()
    const owner = await ownerScope(fresh)

    const view = await loadUzaverka(owner, undefined)
    expect(view.period).toBeNull()
    expect(view.periods).toEqual([])
    expect(view.cells).toHaveLength(5)
  })
})

describe("UzaverkaPage — the owner gate", () => {
  it("renders the matrix, the history and the CSV fallback for the owner", async () => {
    const owner = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)
    const batch = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "manual",
      filename: "vysledovka-07-2026.csv",
      statementLines: VZZ_LINES,
    })
    await publishBatch(owner, batch.id)

    as(org.members.owner.headers)
    const html = await render(
      await UzaverkaPage({
        params: Promise.resolve({ orgSlug: org.slug }),
        searchParams: Promise.resolve({ obdobi: periodId }),
      }),
    )

    expect(html).toContain("uzaverka.matrixTitle")
    expect(html).toContain("uzaverka.historyTitle")
    expect(html).toContain("uzaverka.uploadTitle")
    // The manual-batch-start trigger (manual-entry plan §3, W1) — a Sheet, so
    // only the trigger itself (not its portalled content) is in this markup.
    expect(html).toContain("uzaverka.startSaldokontoTrigger")
    // The published VZZ row shows its state, its file and its row count.
    expect(html).toContain("uzaverka.statePublished")
    expect(html).toContain("vysledovka-07-2026.csv")
    // The four datasets this period has nothing for are still IN the grid, as
    // "not sent" — the office's gap. Nothing reads "not wired" any more: every
    // dataset has a payload table since 0015 (saldokonto) and 0016 (payroll).
    // The branch stays in the component for the next dataset, which is why the
    // matrix has to be able to tell the two gaps apart at all.
    expect(html).toContain("uzaverka.stateMissing")
    expect(html).not.toContain("uzaverka.stateNotWired")

    // The client-side pieces resolve through the REAL catalog (they use
    // next-intl's client hook), so they are asserted on their Czech words.
    expect(html).toContain("Nahrát jako rozpracovaný import")
    expect(html).toContain("Vrátit poslední import")
    expect(html).toContain('name="dataset"')
    expect(html).toContain('type="file"')
    // Every form carries the org slug the action re-resolves its scope from —
    // a form that forgot it is an action that 404s for an invisible reason.
    expect(html).toContain(`value="${org.slug}"`)
  })

  it("answers 404 to every non-owner role", async () => {
    const roles: BetaOrgRole[] = ["admin", "member", "guest"]
    for (const role of roles) {
      as(org.members[role].headers)
      await expect404(() =>
        UzaverkaPage({
          params: Promise.resolve({ orgSlug: org.slug }),
          searchParams: Promise.resolve({}),
        }),
      )
    }
  })

  it("answers 404 to an owner of a DIFFERENT organization", async () => {
    const other = await seedOrganization()
    as(org.members.owner.headers)

    await expect404(() =>
      UzaverkaPage({
        params: Promise.resolve({ orgSlug: other.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
  })
})
