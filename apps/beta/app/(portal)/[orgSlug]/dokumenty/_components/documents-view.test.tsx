/**
 * The Dokumenty table and its row sheet, rendered.
 *
 * WHAT A RENDER TEST IS FOR HERE, and what it is not. The data layer's suite
 * already proves which ROWS a caller may see; this file proves what the client
 * is shown ABOUT a row they may see — the Czech formats of plan Part 3, the
 * columns of spec §2.2, the office message, the preview element the content
 * type earns, and above all the ABSENCE of anything that would let a client
 * write. That last one is the assertion worth having: a mutation affordance is
 * added by accident far more often than a query filter is removed by accident.
 *
 * `renderToStaticMarkup` rather than jsdom + Testing Library: these components
 * are a function of their props, the sheet starts closed, and a string is
 * enough to assert every property above. It also keeps the suite in the `pure`
 * vitest project, with no browser environment and no Postgres behind it.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { DocumentSummary } from "@/lib/data/projections"

import { DocumentDetail } from "./document-detail"
import { DocumentPreview } from "./document-preview"
import { DocumentsTable } from "./documents-table"

const ORG_SLUG = "acme-sro"
const FILE_URL = `/api/orgs/${ORG_SLUG}/documents/doc-1/file`

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

function doc(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "doc-1",
    filename: "Faktura Nováková 03-2026.pdf",
    docType: "invoice_in",
    status: "processed",
    contentType: "application/pdf",
    byteSize: 2048,
    uploadedAt: "2026-03-07T09:24:00.000Z",
    documentDate: "2026-03-01",
    amount: "12345.60",
    siteRef: "Vinohrady",
    officeMessage: null,
    ...overrides,
  }
}

/** Non-breaking and narrow spaces are noise for a substring assertion. */
const flat = (html: string): string => html.replace(/[\u00a0\u202f]/g, " ")

/**
 * All whitespace removed, for the date and money assertions.
 *
 * cs-CZ renders `07. 03. 2026` and `12 345,60 Kč` — the right digits, dots and
 * comma, separated by spaces of three different widths. `i18n/formats.test.ts`
 * compares the same way and for the same reason: the rule of plan Part 3 is
 * about the order and the separators, not about which flavour of space Intl
 * picked for the gaps.
 */
const compact = (html: string): string => html.replace(/\s/g, "")

describe("DocumentsTable — the columns of spec §2.2", () => {
  const html = flat(
    render(<DocumentsTable documents={[doc()]} orgSlug={ORG_SLUG} />),
  )

  it("renders every column header the spec names and no invented one", () => {
    for (const header of [
      "Soubor",
      "Nahráno",
      "Typ",
      "Částka",
      "Stavba",
      "Stav",
      "Zpráva od účetní",
    ]) {
      expect(html).toContain(header)
    }
  })

  it("renders the row in Czech formats — DD.MM.YYYY and Kč", () => {
    expect(html).toContain("Faktura Nováková 03-2026.pdf")
    // Whitespace-stripped, exactly as `i18n/formats.test.ts` compares: cs-CZ
    // renders `07. 03. 2026` and `12 345,60 Kč` with three widths of space, and
    // the rule of plan Part 3 is about the order and the separators.
    // 09:24 UTC in March is 10:24 in Prague.
    expect(compact(html)).toContain("07.03.202610:24")
    expect(compact(html)).toContain("12345,60Kč")
    expect(html).toContain("Vinohrady")
  })

  it("renders the status and type as their Czech labels, never the enum", () => {
    expect(html).toContain("Zpracováno")
    expect(html).toContain("Přijatá faktura")
    expect(html).not.toContain("processed")
    expect(html).not.toContain("invoice_in")
  })

  it("gives every row a named control a keyboard can reach", () => {
    expect(html).toContain(
      'aria-label="Otevřít detail dokladu: Faktura Nováková 03-2026.pdf"',
    )
  })

  it("renders an em dash for the columns the office has not filled in", () => {
    const sparse = flat(
      render(
        <DocumentsTable
          documents={[
            doc({ amount: null, siteRef: null, officeMessage: null }),
          ]}
          orgSlug={ORG_SLUG}
        />,
      ),
    )
    expect(sparse).toContain("—")
    expect(sparse).not.toContain("null")
  })

  it("shows the office message in the row (spec §2.2 'zpráva od účetní')", () => {
    const returned = flat(
      render(
        <DocumentsTable
          documents={[
            doc({ status: "returned", officeMessage: "Chybí druhá strana" }),
          ]}
          orgSlug={ORG_SLUG}
        />,
      ),
    )
    expect(returned).toContain("Vráceno")
    expect(returned).toContain("Chybí druhá strana")
  })

  it("never serialises a forbidden column into the markup", async () => {
    const { CLIENT_FORBIDDEN_COLUMNS } = await import("@/lib/data/projections")
    for (const column of CLIENT_FORBIDDEN_COLUMNS) {
      expect(html).not.toContain(column)
    }
    // And no sign of where the bytes actually live.
    expect(html).not.toContain("org/")
    expect(html).not.toContain("s3")
  })
})

/**
 * The whole surface is read-only for every role (spec §3.1/§3.3: documents are
 * edited in Pro účetní › Zpracování, nowhere else), so this holds for the owner
 * exactly as it holds for a guest. It is asserted from the markup rather than
 * from a role prop precisely BECAUSE there is no role prop: the guarantee is
 * that no such control exists to be gated, and a future PR that adds one
 * without a permission check fails here.
 */
describe("DocumentsTable — no mutation affordance for anyone, guest included", () => {
  const html = render(
    <DocumentsTable
      documents={[doc(), doc({ id: "doc-2", filename: "Účtenka OBI.pdf" })]}
      orgSlug={ORG_SLUG}
    />,
  )

  it("renders no form, no file input and no submit", () => {
    expect(html).not.toContain("<form")
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('type="submit"')
  })

  it("renders no write verb in any Czech label", () => {
    for (const verb of [
      "Nahrát",
      "Smazat",
      "Odstranit",
      "Upravit",
      "Uložit",
      "Změnit stav",
    ]) {
      expect(html).not.toContain(verb)
    }
  })

  it("renders no disabled control either — a greyed-out button is a promise", () => {
    // The rendered ATTRIBUTE, not the substring: Tailwind's `disabled:` state
    // variants live in the class strings of every Button and Input in the
    // design system, so a substring match would fire on a perfectly enabled
    // control and send the next reader hunting for a bug that is not there.
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/)
    expect(html).not.toContain("aria-disabled")
  })

  it("still renders the rows, because a guest may read and download", () => {
    expect(html).toContain("Faktura Nováková 03-2026.pdf")
    expect(html).toContain("Účtenka OBI.pdf")
  })
})

describe("DocumentDetail — the row sheet body", () => {
  it("shows the fields of spec §2.2 and the download", () => {
    const html = flat(
      render(<DocumentDetail document={doc()} fileUrl={FILE_URL} />),
    )

    expect(html).toContain("Zpracováno")
    expect(html).toContain("Přijatá faktura")
    expect(compact(html)).toContain("07.03.202610:24")
    // The office-typed date of the document itself, distinct from "nahráno".
    expect(compact(html)).toContain("01.03.2026")
    expect(compact(html)).toContain("12345,60Kč")
    expect(html).toContain("Vinohrady")
    expect(compact(html)).toContain("2kB")
    expect(html).toContain(`href="${FILE_URL}"`)
    expect(html).toContain("Stáhnout")
    expect(html).toContain("Údaje k dokladu vyplňuje účetní kancelář.")
  })

  it("downloads as an attachment — the plain URL, no disposition override", () => {
    const html = render(<DocumentDetail document={doc()} fileUrl={FILE_URL} />)
    expect(html).toContain(`href="${FILE_URL}" download`)
    expect(html).not.toContain(`href="${FILE_URL}?disposition=inline" download`)
  })

  it("renders the office message as its own block when there is one", () => {
    const html = render(
      <DocumentDetail
        document={doc({
          status: "returned",
          officeMessage: "Chybí druhá strana faktury, doplňte ji prosím.",
        })}
        fileUrl={FILE_URL}
      />,
    )
    expect(html).toContain("Zpráva od účetní")
    expect(html).toContain("Chybí druhá strana faktury, doplňte ji prosím.")
  })

  it("omits the office-message block entirely when there is none", () => {
    const html = render(<DocumentDetail document={doc()} fileUrl={FILE_URL} />)
    expect(html).not.toContain("Zpráva od účetní")
  })

  it("carries no edit control, for any role (spec §3.3)", () => {
    const html = render(<DocumentDetail document={doc()} fileUrl={FILE_URL} />)
    expect(html).not.toContain("<form")
    expect(html).not.toContain("Upravit")
    expect(html).not.toContain("Smazat")
  })

  it("never renders the internal layer, even if a caller smuggles it in", () => {
    const html = render(
      <DocumentDetail
        // A projection cannot carry these — this is the belt to that brace.
        document={
          {
            ...doc(),
            internal_note: "Klient neplatí včas",
            storage_key: "org/x/y.pdf",
          } as DocumentSummary
        }
        fileUrl={FILE_URL}
      />,
    )
    expect(html).not.toContain("Klient neplatí včas")
    expect(html).not.toContain("org/x/y.pdf")
  })
})

describe("DocumentPreview — one element per stored content type", () => {
  it("frames a PDF on ?disposition=preview, with NO sandbox attribute", () => {
    const html = render(
      <DocumentPreview
        document={doc({ contentType: "application/pdf" })}
        fileUrl={FILE_URL}
      />,
    )
    expect(html).toContain("<iframe")
    expect(html).toContain(`src="${FILE_URL}?disposition=preview"`)
    // The confinement is the response's own `sandbox` CSP directive. Chrome
    // refuses to run its PDF viewer in a frame carrying the ATTRIBUTE, so
    // adding one here would break every preview while enforcing nothing extra.
    expect(html).not.toContain("sandbox=")
    expect(html).toContain('title="Náhled dokladu"')
  })

  it.each([
    ["image/png", "stavba.png"],
    ["image/jpeg", "stavba.jpg"],
  ])("renders a %s inline as an image", (contentType, filename) => {
    const html = render(
      <DocumentPreview
        document={doc({ contentType, filename })}
        fileUrl={FILE_URL}
      />,
    )
    expect(html).toContain("<img")
    expect(html).toContain(`src="${FILE_URL}?disposition=inline"`)
    expect(html).toContain(`alt="${filename}"`)
    expect(html).not.toContain("<iframe")
  })

  it("explains itself for a type no browser renders, rather than showing a blank frame", () => {
    const html = render(
      <DocumentPreview
        document={doc({ contentType: "image/heic", filename: "foto.heic" })}
        fileUrl={FILE_URL}
      />,
    )
    expect(html).not.toContain("<iframe")
    expect(html).not.toContain("<img")
    expect(html).toContain("Náhled tohoto souboru prohlížeč nezobrazí.")
  })
})
