/**
 * The Zadávání dat sections, rendered.
 *
 * The actions' own suite (`_actions/zadavani.db.test.ts`) proves who may write
 * and what a bad payload does. This file proves the FORM SIDE of the same
 * contract, which no action test can see:
 *
 *   1. every form carries the hidden `orgSlug` the action resolves its scope
 *      from — a form that forgot it is an action that 404s for a reason nobody
 *      could see from the page;
 *   2. every mutating control is a real form control, so the surface works
 *      without client JavaScript (the whole reason `OfficeActionForm` uses
 *      `useActionState` rather than an `onSubmit`);
 *   3. the mark-paid flag is posted as an explicit `true` / `false` literal
 *      rather than as a checkbox — absence must never be readable as "unpaid";
 *   4. the creditor select offers three groups, never `dodavatele`.
 *
 * `renderToStaticMarkup`, following PR 12's Dokumenty suite: these are pure
 * functions of their props and a string is enough. Server Actions render as
 * inert `action` attributes here, which is exactly what is being asserted about
 * — the FIELDS around them, not the dispatch.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { FilingView, LiabilityView } from "@/lib/data/projections"

import { FilingsSection } from "./filings-section"
import { LiabilitiesSection } from "./liabilities-section"

const ORG_SLUG = "acme-sro"

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

const tight = (html: string): string => html.replace(/\s/g, "")

function filing(overrides: Partial<FilingView> = {}): FilingView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6",
    kind: "dph_priznani",
    family: "dph",
    status: "planned",
    period: {
      id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f7",
      kind: "month",
      year: 2026,
      month: 3,
      quarter: null,
      startsOn: "2026-03-01",
      endsOn: "2026-03-31",
    },
    dueOn: "2026-04-27",
    filedOn: null,
    amountDue: "31200.00",
    paidAt: null,
    variableSymbol: "12345678",
    hasAttachment: false,
    attachmentDocumentId: null,
    noteClient: null,
    overdue: false,
    updatedAt: "2026-03-07T10:00:00.000Z",
    ...overrides,
  }
}

function liability(overrides: Partial<LiabilityView> = {}): LiabilityView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f8",
    group: "ostatni",
    label: "Penále z prodlení",
    amount: "1500.50",
    dueOn: "2026-04-30",
    paidAt: null,
    variableSymbol: "87654321",
    noteClient: null,
    overdue: false,
    updatedAt: "2026-03-07T10:00:00.000Z",
    ...overrides,
  }
}

describe("FilingsSection", () => {
  it("carries orgSlug on every form — the field each action resolves its scope from", () => {
    const html = render(
      <FilingsSection filings={[filing()]} orgSlug={ORG_SLUG} />,
    )

    const forms = html.split("<form").length - 1
    const slugFields =
      html.split(`<input type="hidden" name="orgSlug" value="${ORG_SLUG}"/>`)
        .length - 1

    expect(forms).toBeGreaterThan(0)
    expect(slugFields, "one hidden orgSlug per form").toBe(forms)
  })

  it("asks for the period as coordinates, not as an id a browser could guess", () => {
    const html = render(<FilingsSection filings={[]} orgSlug={ORG_SLUG} />)

    // `ensureReportingPeriod` upserts from these; a `periodId` field would be
    // a row reference travelling through request input.
    expect(html).toContain('name="periodKind"')
    expect(html).toContain('name="year"')
    expect(html).toContain('name="month"')
    expect(html).toContain('name="quarter"')
    expect(html).not.toContain('name="periodId"')
  })

  it("offers every filing kind and status the enums declare", () => {
    const html = render(<FilingsSection filings={[]} orgSlug={ORG_SLUG} />)

    expect(html).toContain('value="dph_priznani"')
    expect(html).toContain('value="jmhz"')
    expect(html).toContain('value="corrective"')
    expect(html).toContain("Přiznání k DPH")
  })

  it("posts mark-paid as an explicit literal, never as a checkbox", () => {
    const unpaid = render(
      <FilingsSection filings={[filing()]} orgSlug={ORG_SLUG} />,
    )
    // Absence of a checkbox must never be readable as "mark it unpaid" — that
    // would make a debt disappear on an unrelated save.
    expect(unpaid).toContain('name="paid" value="true"')
    expect(unpaid).toContain("Označit jako zaplacené")

    const paid = render(
      <FilingsSection
        filings={[filing({ paidAt: "2026-05-02T07:30:00.000Z" })]}
        orgSlug={ORG_SLUG}
      />,
    )
    expect(paid).toContain('name="paid" value="false"')
    expect(paid).toContain("Vrátit mezi nezaplacené")
    expect(paid).toContain("Zaplaceno")
  })

  it("does not let a row's identity be edited — only its amount, date and state", () => {
    const html = render(
      <FilingsSection filings={[filing()]} orgSlug={ORG_SLUG} />,
    )

    // `FilingPatch` carries neither `kind` nor `period_id`: both are the row's
    // identity, and re-pointing either rewrites history for every surface that
    // already showed it. The row's edit form must not offer them.
    const rowForm = html.slice(html.indexOf('name="filingId"'))
    expect(rowForm).toContain('name="amountDue"')
    expect(rowForm).toContain('name="dueOn"')
    expect(rowForm).toContain('name="status"')
    expect(rowForm).not.toContain('name="periodKind"')
  })

  it("says a filing has no amount rather than showing it as zero", () => {
    const html = render(
      <FilingsSection
        filings={[filing({ amountDue: null })]}
        orgSlug={ORG_SLUG}
      />,
    )

    expect(html).toContain("Bez částky")
    expect(tight(html)).not.toContain("0,00Kč")
  })

  it("renders the period as a person reads it", () => {
    const html = render(
      <FilingsSection filings={[filing()]} orgSlug={ORG_SLUG} />,
    )
    expect(html).toContain("03/2026")
  })

  it("has an empty state rather than a bare table head", () => {
    const html = render(<FilingsSection filings={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain("Zatím tu nic není.")
  })
})

describe("LiabilitiesSection", () => {
  it("offers three creditor groups and never dodavatele", () => {
    const html = render(
      <LiabilitiesSection liabilities={[]} orgSlug={ORG_SLUG} />,
    )

    expect(html).toContain('value="fu"')
    expect(html).toContain('value="cssz_zp"')
    expect(html).toContain('value="ostatni"')
    // The saldokonto import owns that group (PR 28); offering it here would be
    // offering an option whose only outcome is a constraint violation.
    expect(html).not.toContain('value="dodavatele"')
  })

  it("tells the office what belongs here — the anti-triple-entry hint", () => {
    const html = render(
      <LiabilitiesSection liabilities={[]} orgSlug={ORG_SLUG} />,
    )
    expect(html).toContain("penále")
    expect(html).toContain("splátkový kalendář")
  })

  it("carries orgSlug and the row id on every mutating form", () => {
    const html = render(
      <LiabilitiesSection liabilities={[liability()]} orgSlug={ORG_SLUG} />,
    )

    const forms = html.split("<form").length - 1
    const slugFields =
      html.split(`<input type="hidden" name="orgSlug" value="${ORG_SLUG}"/>`)
        .length - 1
    expect(slugFields).toBe(forms)
    expect(html).toContain('name="liabilityId"')
  })

  it("lets every field be edited — a liability has no identity columns", () => {
    const html = render(
      <LiabilitiesSection liabilities={[liability()]} orgSlug={ORG_SLUG} />,
    )

    const rowForm = html.slice(html.indexOf('name="liabilityId"'))
    for (const field of [
      "label",
      "group",
      "amount",
      "dueOn",
      "variableSymbol",
    ]) {
      expect(rowForm, field).toContain(`name="${field}"`)
    }
  })

  it("marks Po splatnosti, Zaplaceno and Nezaplaceno distinctly", () => {
    expect(
      render(
        <LiabilitiesSection liabilities={[liability()]} orgSlug={ORG_SLUG} />,
      ),
    ).toContain("Nezaplaceno")
    expect(
      render(
        <LiabilitiesSection
          liabilities={[liability({ overdue: true })]}
          orgSlug={ORG_SLUG}
        />,
      ),
    ).toContain("Po splatnosti")
    expect(
      render(
        <LiabilitiesSection
          liabilities={[liability({ paidAt: "2026-05-02T07:30:00.000Z" })]}
          orgSlug={ORG_SLUG}
        />,
      ),
    ).toContain("Zaplaceno")
  })

  it("renders the office's own titul verbatim, and the amount in Kč", () => {
    const html = render(
      <LiabilitiesSection liabilities={[liability()]} orgSlug={ORG_SLUG} />,
    )
    expect(html).toContain("Penále z prodlení")
    expect(tight(html)).toContain("1500,50Kč")
  })

  it("has an empty state", () => {
    const html = render(
      <LiabilitiesSection liabilities={[]} orgSlug={ORG_SLUG} />,
    )
    expect(html).toContain("Zatím tu nic není.")
  })
})
