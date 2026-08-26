/**
 * Přehled's six sections, rendered (spec §2.1).
 *
 * WHAT THIS SUITE IS FOR. `lib/data/deadlines.test.ts` and
 * `_lib/load-prehled.db.test.ts` already prove WHICH rows reach this page and
 * which judgements the loader makes about them. This file proves what a client
 * is SHOWN — and on a dashboard almost every assertion worth writing is about an
 * ABSENCE:
 *
 *   - a dataset nobody has sent renders as "zatím nenahráno", never as 0 Kč
 *     (§0.4, and the single most important string on the page);
 *   - a feed that does not exist yet renders as "zatím nenapojeno", which is a
 *     different fact from an empty one;
 *   - obrat renders as absent for a neplátce and NOT AT ALL for a plátce (§5);
 *   - a task with no link renders no link rather than a link to this page;
 *   - nothing anywhere is a form, a button or an input (§3.3).
 *
 * `renderToStaticMarkup` rather than jsdom, following the Dokumenty and Dluhy
 * suites: every component here is a pure function of its props, so a string is
 * enough — and it keeps the file in the `pure` vitest project.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { UpcomingDeadline } from "@/lib/data/deadlines"
import type { DatasetFreshness } from "@/lib/data/imports"
import type { DocumentSummary, OrganizationCard } from "@/lib/data/projections"

import { CompanyCard } from "./company-card"
import { DataPresence } from "./data-presence"
import { FirstMonthNotice } from "./first-month-notice"
import { KpiTiles, type KpiTile } from "./kpi-tiles"
import { RecentDocuments } from "./recent-documents"
import { TurnoverWatch } from "./turnover-watch"
import { UpcomingDeadlines } from "./upcoming-deadlines"

const ORG_SLUG = "acme-sro"
const TODAY = "2026-08-26"

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={BETA_LOCALE}
      timeZone={BETA_TIME_ZONE}
      formats={betaFormats}
      messages={betaMessages as never}
    >
      {node}
    </NextIntlClientProvider>,
  )
}

/** cs-CZ separates with spaces of three widths; compare on the rest. */
const tight = (html: string): string => html.replace(/\s/g, "")

const READ_ONLY = ["<form", "<button", "<input", "<select", "<textarea"]

function expectReadOnly(html: string): void {
  for (const affordance of READ_ONLY) {
    expect(html).not.toContain(affordance)
  }
}

// ---------------------------------------------------------------------------
// §2.1 item 2 — Nejbližší termíny (Advisor F25)
// ---------------------------------------------------------------------------

function deadline(overrides: Partial<UpcomingDeadline> = {}): UpcomingDeadline {
  return {
    key: "urad:filing-1",
    origin: "urad",
    filingKind: "dph_priznani",
    family: "dph",
    label: null,
    amount: null,
    linkKind: null,
    dueOn: "2026-09-25",
    overdue: false,
    daysOverdue: 0,
    ...overrides,
  }
}

describe("UpcomingDeadlines — one list, three origins", () => {
  it("chips each origin in Czech", () => {
    const html = render(
      <UpcomingDeadlines
        orgSlug={ORG_SLUG}
        deadlines={[
          deadline(),
          deadline({
            key: "platba:filing-1",
            origin: "platba",
            family: null,
            amount: "31200.00",
          }),
          deadline({
            key: "ucetni:task-1",
            origin: "ucetni",
            filingKind: null,
            family: null,
            label: "Dodejte výpis z účtu",
            linkKind: "dokumenty",
          }),
        ]}
      />,
    )

    expect(html).toContain("Úřad")
    expect(html).toContain("Platba")
    expect(html).toContain("Od účetní")
  })

  it("renders a filing through its Czech form name and a task verbatim", () => {
    const html = render(
      <UpcomingDeadlines
        orgSlug={ORG_SLUG}
        deadlines={[
          deadline(),
          deadline({
            key: "ucetni:task-1",
            origin: "ucetni",
            filingKind: null,
            family: null,
            label: "Dodejte výpis z účtu",
            linkKind: "none",
          }),
        ]}
      />,
    )

    expect(html).toContain("Přiznání k DPH")
    // The office's own words are never translated.
    expect(html).toContain("Dodejte výpis z účtu")
    expect(html).not.toContain("null")
  })

  it("shows the same filing twice — once to file, once to pay", () => {
    // The two acts of spec §2.1's union. If a future dedup collapsed them, the
    // one that would disappear is the payment.
    const html = render(
      <UpcomingDeadlines
        orgSlug={ORG_SLUG}
        deadlines={[
          deadline({ key: "urad:filing-1" }),
          deadline({
            key: "platba:filing-1",
            origin: "platba",
            family: null,
            amount: "31200.00",
          }),
        ]}
      />,
    )

    expect(html).toContain("Úřad")
    expect(html).toContain("Platba")
    expect(tight(html)).toContain("31200,00Kč")
  })

  it("marks Po splatnosti, and does not mark what is not", () => {
    const overdue = render(
      <UpcomingDeadlines
        orgSlug={ORG_SLUG}
        deadlines={[deadline({ overdue: true, daysOverdue: 12 })]}
      />,
    )
    expect(overdue).toContain("Po splatnosti")

    expect(
      render(<UpcomingDeadlines orgSlug={ORG_SLUG} deadlines={[deadline()]} />),
    ).not.toContain("Po splatnosti")
  })

  it("deep-links a filing to its own §2.3 family tab", () => {
    const html = render(
      <UpcomingDeadlines orgSlug={ORG_SLUG} deadlines={[deadline()]} />,
    )
    expect(html).toContain(`/${ORG_SLUG}/dane/dph`)
  })

  it("links a payment to Dluhy a platby", () => {
    const html = render(
      <UpcomingDeadlines
        orgSlug={ORG_SLUG}
        deadlines={[
          deadline({ key: "platba:1", origin: "platba", family: null }),
        ]}
      />,
    )
    expect(html).toContain(`/${ORG_SLUG}/finance/dluhy-a-platby`)
  })

  it("gives a task with no link no link at all — never one back to this page", () => {
    const html = render(
      <UpcomingDeadlines
        orgSlug={ORG_SLUG}
        deadlines={[
          deadline({
            key: "ucetni:task-1",
            origin: "ucetni",
            filingKind: null,
            family: null,
            label: "Dodejte výpis",
            linkKind: "none",
          }),
        ]}
      />,
    )

    expect(html).not.toContain("<a")
  })

  it("says so plainly when there is nothing due", () => {
    const html = render(<UpcomingDeadlines orgSlug={ORG_SLUG} deadlines={[]} />)
    expect(html).toContain("Žádný termín zatím neevidujeme.")
  })

  it("offers no way to change anything", () => {
    expectReadOnly(
      render(<UpcomingDeadlines orgSlug={ORG_SLUG} deadlines={[deadline()]} />),
    )
  })
})

// ---------------------------------------------------------------------------
// §2.1 item 3 — KPI tiles, on data presence only
// ---------------------------------------------------------------------------

describe("KpiTiles — never a zero-value placeholder", () => {
  const tile: KpiTile = {
    key: "obligations",
    labelKey: "prehled.kpiObligations",
    value: "31200.00",
    asOf: "2026-08-20T10:00:00.000Z",
    caption: "0,00 Kč z toho po splatnosti",
    href: `/${ORG_SLUG}/finance/dluhy-a-platby`,
  }

  it("renders nothing at all when no feeder has spoken", () => {
    // Not an empty section with a heading — nothing. A heading over no tiles
    // is the dead composition F18 rules out.
    expect(render(<KpiTiles tiles={[]} />)).toBe("")
  })

  it("renders a value in cs-CZ with its own as-of stamp", () => {
    const html = render(<KpiTiles tiles={[tile]} />)

    expect(html).toContain("Otevřené závazky")
    expect(tight(html)).toContain("31200,00Kč")
    expect(html).toContain("Údaje k")
    expect(tight(html)).toContain("20.08.2026")
  })

  it("links each tile to the module that owns the number", () => {
    expect(render(<KpiTiles tiles={[tile]} />)).toContain(
      `/${ORG_SLUG}/finance/dluhy-a-platby`,
    )
  })

  it("is read-only", () => {
    expectReadOnly(render(<KpiTiles tiles={[tile]} />))
  })
})

// ---------------------------------------------------------------------------
// §0.4 / F24 — per-dataset presence and the warning band
// ---------------------------------------------------------------------------

function dataset(overrides: Partial<DatasetFreshness>): DatasetFreshness {
  return {
    dataset: "rozvaha",
    implemented: true,
    period: null,
    publishedAt: null,
    batchId: null,
    rowCount: 0,
    ...overrides,
  }
}

const period = (year: number, month: number) => ({
  id: `period-${year}-${month}`,
  kind: "month" as const,
  year,
  month,
  quarter: null,
  startsOn: `${year}-${String(month).padStart(2, "0")}-01`,
  endsOn: `${year}-${String(month).padStart(2, "0")}-28`,
})

describe("DataPresence — three states, never collapsed into 'no data'", () => {
  it("says a dataset with no payload table yet is NOT CONNECTED", () => {
    const html = render(
      <DataPresence
        datasets={[dataset({ dataset: "saldokonto", implemented: false })]}
        documents={{ total: 0, newestUploadedAt: null }}
        today={TODAY}
      />,
    )

    expect(html).toContain("Zatím nenapojeno")
    expect(html).not.toContain("0 Kč")
  })

  it("distinguishes a connected-but-empty dataset from an absent one", () => {
    const html = render(
      <DataPresence
        datasets={[dataset({ dataset: "rozvaha", implemented: true })]}
        documents={{ total: 0, newestUploadedAt: null }}
        today={TODAY}
      />,
    )

    expect(html).toContain("Zatím nenahráno")
    expect(html).not.toContain("Zatím nenapojeno")
  })

  it("stamps a published dataset with its period and its publication date", () => {
    const html = render(
      <DataPresence
        datasets={[
          dataset({
            dataset: "rozvaha",
            period: period(2026, 7),
            publishedAt: "2026-08-12T08:00:00.000Z",
            batchId: "batch-1",
            rowCount: 42,
          }),
        ]}
        documents={{ total: 0, newestUploadedAt: null }}
        today={TODAY}
      />,
    )

    expect(html).toContain("07/2026")
    expect(tight(html)).toContain("12.08.2026")
    // One period of slack is on time — no band.
    expect(html).not.toContain("novější zatím nebyly nahrány")
  })

  it("raises §0.4's warning band from two periods behind, in §0.4's own words", () => {
    const html = render(
      <DataPresence
        datasets={[
          dataset({
            dataset: "rozvaha",
            period: period(2026, 5),
            publishedAt: "2026-06-12T08:00:00.000Z",
            batchId: "batch-1",
            rowCount: 42,
          }),
        ]}
        documents={{ total: 0, newestUploadedAt: null }}
        today={TODAY}
      />,
    )

    expect(html).toContain("Poslední údaje k")
    expect(html).toContain("novější zatím nebyly nahrány")
    expect(html).toContain("Starší období")
  })

  it("gives dokumenty a count and an upload stamp, and no period band", () => {
    const html = render(
      <DataPresence
        datasets={[]}
        documents={{ total: 12, newestUploadedAt: "2026-08-24T14:00:00.000Z" }}
        today={TODAY}
      />,
    )

    expect(html).toContain("Dokumenty")
    expect(html).toContain("12")
    expect(html).toContain("dokladů")
    expect(tight(html)).toContain("24.08.2026")
    expect(html).not.toContain("Starší období")
  })

  it("is read-only", () => {
    expectReadOnly(
      render(
        <DataPresence
          datasets={[dataset({})]}
          documents={{ total: 0, newestUploadedAt: null }}
          today={TODAY}
        />,
      ),
    )
  })
})

// ---------------------------------------------------------------------------
// §2.1 item 4 / §5 — obrat watch
// ---------------------------------------------------------------------------

describe("TurnoverWatch — neplátce only, office-provided only", () => {
  it("renders nothing at all for a plátce", () => {
    // §5's VAT gate. Not an empty card, not a hidden one — absent.
    expect(render(<TurnoverWatch vatRegime="platce" reading={null} />)).toBe("")
  })

  it("states both thresholds for a neplátce", () => {
    const html = render(<TurnoverWatch vatRegime="neplatce" reading={null} />)

    expect(tight(html)).toContain("2000000,00Kč")
    expect(tight(html)).toContain("2536500,00Kč")
    expect(html).toContain("povinnost registrace k DPH")
    expect(html).toContain("plátcem ze zákona")
  })

  it("says the figure is missing rather than showing a computed one", () => {
    const html = render(<TurnoverWatch vatRegime="neplatce" reading={null} />)

    expect(html).toContain("Obrat zatím nemáme.")
    expect(html).toContain("portál obrat nepočítá")
    // Both §2.1 feeds, named and marked unconnected.
    expect(html).toContain("Údaj od účetní")
    expect(html).toContain("Výnosy z výsledovky")
    expect(html).toContain("Zatím nenapojeno")
  })

  it("prints an office-provided figure with its tier and its as-of date", () => {
    const html = render(
      <TurnoverWatch
        vatRegime="neplatce"
        reading={{
          amount: "2100000.00",
          asOf: "2026-07-31",
          source: "indicator",
        }}
      />,
    )

    expect(tight(html)).toContain("2100000,00Kč")
    expect(html).toContain("Nad hranicí registrace")
    expect(tight(html)).toContain("31.07.2026")
  })

  it("escalates over the second threshold and stays calm under the first", () => {
    const payer = render(
      <TurnoverWatch
        vatRegime="neplatce"
        reading={{
          amount: "2600000.00",
          asOf: "2026-07-31",
          source: "indicator",
        }}
      />,
    )
    expect(payer).toContain("Plátcem ze zákona")

    const below = render(
      <TurnoverWatch
        vatRegime="neplatce"
        reading={{
          amount: "800000.00",
          asOf: "2026-07-31",
          source: "vzz_import",
        }}
      />,
    )
    expect(below).toContain("Pod hranicí")
    expect(below).not.toContain("Nad hranicí registrace")
  })

  it("is read-only", () => {
    expectReadOnly(
      render(<TurnoverWatch vatRegime="neplatce" reading={null} />),
    )
  })
})

// ---------------------------------------------------------------------------
// §2.1 item 5 — Karta společnosti
// ---------------------------------------------------------------------------

function org(overrides: Partial<OrganizationCard> = {}): OrganizationCard {
  return {
    id: "org-1",
    slug: ORG_SLUG,
    legalName: "ACME stavby s.r.o.",
    vatRegime: "platce",
    vatRegisteredFrom: "2024-01-01",
    isDemo: false,
    ico: "12345678",
    dic: "CZ12345678",
    registeredStreet: "Dlouhá",
    registeredHouseNumber: "123",
    registeredOrientationNumber: "45",
    registeredCity: "Praha 1",
    registeredPostalCode: "110 00",
    registeredCountryCode: "CZ",
    dataBoxId: "abc1234",
    courtFileNumber: "C 12345 vedená u Městského soudu v Praze",
    taxOfficeCode: "001",
    bankAccountPrefix: "19",
    bankAccountNumber: "2000145399",
    bankCode: "0800",
    iban: null,
    bic: null,
    aresFetchedAt: "2026-08-01T06:00:00.000Z",
    ...overrides,
  }
}

describe("CompanyCard — the identity card of §2.1 item 5", () => {
  it("renders every field the spec names", () => {
    const html = render(<CompanyCard org={org()} />)

    expect(html).toContain("ACME stavby s.r.o.")
    expect(html).toContain("12345678")
    expect(html).toContain("CZ12345678")
    expect(html).toContain("Dlouhá 123/45, 110 00 Praha 1")
    expect(html).toContain("19-2000145399/0800")
    expect(html).toContain("abc1234")
    expect(html).toContain("C 12345 vedená u Městského soudu v Praze")
  })

  it("shows the DIČ for a plátce and the badge for a neplátce — never both", () => {
    const platce = render(<CompanyCard org={org()} />)
    expect(platce).toContain("Plátce DPH")
    expect(platce).toContain("DIČ")

    const neplatce = render(
      <CompanyCard org={org({ vatRegime: "neplatce", dic: null })} />,
    )
    expect(neplatce).toContain("Neplátce DPH")
    // An empty "DIČ —" row would read as a missing value rather than as a
    // number that does not exist.
    expect(neplatce).not.toContain("DIČ")
  })

  it("says Neuvedeno for a field the office has not filled in", () => {
    const html = render(
      <CompanyCard
        org={org({
          ico: null,
          dataBoxId: null,
          courtFileNumber: null,
          registeredStreet: null,
          registeredHouseNumber: null,
          registeredOrientationNumber: null,
          registeredCity: null,
          registeredPostalCode: null,
          bankAccountPrefix: null,
          bankAccountNumber: null,
          bankCode: null,
        })}
      />,
    )

    expect(html).toContain("Neuvedeno")
    expect(html).not.toContain("null")
  })

  it("links nowhere — Nastavení › Společnost does not exist yet", () => {
    // A card linking to a 404 is worse than a card that does not link. The
    // link lands in the PR that creates the route (PR 21).
    expect(render(<CompanyCard org={org()} />)).not.toContain("<a")
  })

  it("is read-only", () => {
    expectReadOnly(render(<CompanyCard org={org()} />))
  })
})

// ---------------------------------------------------------------------------
// §2.1 item 6 — Poslední dokumenty
// ---------------------------------------------------------------------------

function doc(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "doc-1",
    filename: "Faktura Nováková 08-2026.pdf",
    docType: "invoice_in",
    status: "processed",
    contentType: "application/pdf",
    byteSize: 2048,
    uploadedAt: "2026-08-24T09:24:00.000Z",
    documentDate: "2026-08-01",
    amount: "12345.60",
    siteRef: null,
    officeMessage: null,
    hasPreview: false,
    ...overrides,
  }
}

describe("RecentDocuments", () => {
  it("chips each status in Czech, and marks Vráceno as the one to act on", () => {
    const html = render(
      <RecentDocuments
        orgSlug={ORG_SLUG}
        documents={[doc(), doc({ id: "doc-2", status: "returned" })]}
      />,
    )

    expect(html).toContain("Zpracováno")
    expect(html).toContain("Vráceno")
    expect(html).toContain("destructive")
  })

  it("links to Dokumenty rather than offering a second upload path", () => {
    const html = render(
      <RecentDocuments orgSlug={ORG_SLUG} documents={[doc()]} />,
    )

    expect(html).toContain(`/${ORG_SLUG}/dokumenty`)
    expectReadOnly(html)
  })

  it("says so plainly on an empty book", () => {
    expect(
      render(<RecentDocuments orgSlug={ORG_SLUG} documents={[]} />),
    ).toContain("Zatím jste nenahráli žádný doklad.")
  })
})

// ---------------------------------------------------------------------------
// F18 — the first-month state
// ---------------------------------------------------------------------------

describe("FirstMonthNotice", () => {
  it("says the spec's own sentence, and names the next event", () => {
    const html = render(<FirstMonthNotice />)

    expect(html).toContain(
      "Finanční přehledy se objeví po první měsíční uzávěrce.",
    )
    expect(html).toContain("uzavře první měsíc")
    expectReadOnly(html)
  })
})
