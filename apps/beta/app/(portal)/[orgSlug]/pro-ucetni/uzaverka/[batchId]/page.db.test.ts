/**
 * The batch preview — the step between "the file parsed" and "the client sees
 * it".
 *
 * WHAT IT HAS TO PROVE. That the office is shown the SAME rows, in the SAME
 * components, that the client will get (the whole reason `StatementTable` and
 * `TrialBalanceTable` live in `app/_components/`); that a draft is reachable
 * here and nowhere else; that the offered actions match the batch's state; and
 * that a foreign or malformed batch id is an ordinary 404 rather than a 500
 * from Postgres refusing to cast it.
 */
import { createElement, type ReactElement, type ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { BetaOrgRole } from "@/db/schema"
import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type {
  StatementLineInput,
  TrialBalanceLineInput,
} from "@/lib/data/imports"
import {
  createMonthPeriod,
  createPartnerRow,
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
const BatchPreviewPage = (await import("./page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

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

const digits = (html: string): string => html.replace(/\s/g, "")

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

function open(orgSlug: string, batchId: string) {
  return BatchPreviewPage({ params: Promise.resolve({ orgSlug, batchId }) })
}

const ROZVAHA_LINES = [
  {
    statementKind: "rozvaha_aktiva" as const,
    rowCode: "001",
    rowLabel: "AKTIVA CELKEM",
    sortOrder: 1,
    isBold: true,
    brutto: "5000000.00",
    korekce: "-1200000.00",
    netto: "3800000.00",
  },
  {
    statementKind: "rozvaha_pasiva" as const,
    ozn: "A.",
    rowCode: "079",
    rowLabel: "Vlastní kapitál",
    sortOrder: 2,
    bezne: "1800000.00",
  },
] as const satisfies readonly StatementLineInput[]

const PREDVAHA_LINES = [
  {
    accountCode: "221100",
    accountName: "Bankovní účet CZK",
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

describe("BatchPreviewPage", () => {
  it("previews a DRAFT rozvaha with both sides and the draft's own actions", async () => {
    const owner = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)
    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "rozvaha",
      source: "manual",
      filename: "rozvaha-07-2026.csv",
      statementLines: ROZVAHA_LINES,
    })

    const html = await render(await open(org.slug, draft.id))

    // The client's own components, with the office's own numbers.
    expect(html).toContain("AKTIVA CELKEM")
    expect(html).toContain("Vlastní kapitál")
    expect(digits(html)).toContain("-1200000,00")
    expect(html).toContain("rozvaha-07-2026.csv")
    expect(html).toContain("uzaverka.statusDraft")

    // A draft can be published or discarded; there is nothing to roll back.
    expect(html).toContain("Zveřejnit")
    expect(html).toContain("Zahodit")
    expect(html).not.toContain("Vrátit poslední import")
  })

  it("previews a PUBLISHED předvaha and offers only the rollback", async () => {
    const owner = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)
    const batch = await createDraftBatch(owner, {
      periodId,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: PREDVAHA_LINES,
    })
    await publishBatch(owner, batch.id)

    const html = await render(await open(org.slug, batch.id))

    expect(html).toContain("Bankovní účet CZK")
    expect(digits(html)).toContain("2128450,50")
    expect(html).toContain("uzaverka.statusPublished")
    expect(html).toContain("Vrátit poslední import")
    expect(html).not.toContain("Zahodit")
  })

  it("previews a DRAFT saldokonto, one row per partner, and offers only draft actions", async () => {
    const owner = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)
    const acme = await createPartnerRow(org.organizationId, {
      name: "ACME s.r.o.",
    })

    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "saldokonto",
      source: "manual",
      partnerSaldoLines: [
        {
          partnerId: acme,
          receivableTotal: null,
          payableTotal: "3400.00",
          oldestDue: "2026-05-01",
        },
      ],
    })

    const html = await render(await open(org.slug, draft.id))

    expect(html).toContain("ACME s.r.o.")
    expect(digits(html)).toContain("3400,00")
    expect(html).toContain("uzaverka.statusDraft")
    expect(html).toContain("Zveřejnit")
    expect(html).toContain("Zahodit")
    expect(html).not.toContain("Vrátit poslední import")
  })

  it("renders the empty state for a manual saldokonto draft with no rows yet", async () => {
    const owner = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)

    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "saldokonto",
      source: "manual",
      partnerSaldoLines: [],
    })

    const html = await render(await open(org.slug, draft.id))
    expect(html).toContain("uzaverka.saldokontoBatchEmpty")
  })

  it("answers 404 to every non-owner role", async () => {
    const owner = await ownerScope(org)
    const periodId = await createMonthPeriod(org.organizationId)
    const draft = await createDraftBatch(owner, {
      periodId,
      dataset: "vzz",
      source: "agent",
      statementLines: [
        {
          statementKind: "vzz",
          rowCode: "057",
          rowLabel: "Výsledek hospodaření",
          sortOrder: 1,
          bezne: "1.00",
        },
      ],
    })

    const roles: BetaOrgRole[] = ["admin", "member", "guest"]
    for (const role of roles) {
      as(org.members[role].headers)
      await expect404(
        () => open(org.slug, draft.id),
        `${role} must not open a draft's rows`,
      )
    }
  })

  it("answers 404 for another organization's batch and for a malformed id", async () => {
    const other = await seedOrganization()
    const otherOwner = await ownerScope(other)
    const otherPeriod = await createMonthPeriod(other.organizationId)
    const otherBatch = await createDraftBatch(otherOwner, {
      periodId: otherPeriod,
      dataset: "predvaha",
      source: "agent",
      trialBalanceLines: PREDVAHA_LINES,
    })

    as(org.members.owner.headers)
    await expect404(
      () => open(org.slug, otherBatch.id),
      "a batch id from another book is simply not there",
    )
    // Not a 500 from `uuid = 'not-a-uuid'` (Postgres 22P02).
    await expect404(
      () => open(org.slug, "not-a-uuid"),
      "a malformed id is an ordinary refusal",
    )
  })
})
