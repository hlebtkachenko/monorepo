/**
 * The Dokumenty query parser — the boundary between a URL and a WHERE clause.
 *
 * This is the only place request input becomes filter values, so it is the only
 * place that can let something through. The cases below are the two halves of
 * that job: everything unrecognised collapses to `null` (a stale link shows the
 * unfiltered list rather than an error page), and everything recognised is a
 * member of a closed set the data layer no longer has to re-check.
 *
 * The last case is the drift guard: the allowed-value arrays are written out
 * here rather than derived from the pgEnum — deliberately, so a Client
 * Component importing this module does not drag `drizzle-orm/pg-core` into its
 * bundle — and this is what fails when the enum grows and the arrays do not.
 */
import { describe, expect, it } from "vitest"

import { betaDocumentStatus, betaDocumentType } from "@/db/schema"

import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_TYPE_VALUES,
  documentListSearchParams,
  hasActiveFilters,
  parseDocumentListQuery,
  EMPTY_DOCUMENT_LIST_FILTERS,
} from "./document-filters"

const parse = (search: string) =>
  parseDocumentListQuery(new URLSearchParams(search))

describe("parseDocumentListQuery — recognised values", () => {
  it("reads every filter of spec §2.2", () => {
    const { filters, page } = parse(
      "status=processed&type=invoice_in&from=2026-03-01&to=2026-03-31&site=Vinohrady&q=faktura&page=3",
    )
    expect(filters).toEqual({
      status: "processed",
      docType: "invoice_in",
      from: "2026-03-01",
      to: "2026-03-31",
      siteRef: "Vinohrady",
      search: "faktura",
    })
    expect(page).toBe(3)
  })

  it("reads a plain record of search params, the shape a page receives", () => {
    const { filters, page } = parseDocumentListQuery({
      status: "returned",
      // A repeated parameter is a hand-edited URL, not an error: first wins.
      type: ["receipt", "contract"],
      page: "2",
      site: undefined,
    })
    expect(filters.status).toBe("returned")
    expect(filters.docType).toBe("receipt")
    expect(filters.siteRef).toBeNull()
    expect(page).toBe(2)
  })

  it("trims and bounds the free-text filters", () => {
    const long = "a".repeat(500)
    const { filters } = parse(`q=${long}&site=%20%20Vinohrady%20%20`)
    expect(filters.search).toHaveLength(120)
    expect(filters.siteRef).toBe("Vinohrady")
  })

  it("treats an empty value as no filter", () => {
    const { filters } = parse("status=&type=&from=&to=&site=&q=")
    expect(filters).toEqual(EMPTY_DOCUMENT_LIST_FILTERS)
    expect(hasActiveFilters(filters)).toBe(false)
  })
})

describe("parseDocumentListQuery — everything else becomes null", () => {
  it.each([
    ["an unknown status", "status=schvaleno"],
    ["a status that is not one", "status=%27%20OR%201%3D1%20--"],
    // `payslip` is a real enum member and deliberately NOT a filter option:
    // those rows are excluded from every Dokumenty read server-side, so the
    // option could only ever render an empty table.
    ["payslip", "type=payslip"],
    ["an unknown type", "type=faktura"],
  ])("drops %s", (_label, search) => {
    const { filters } = parse(search)
    expect(filters.status).toBeNull()
    expect(filters.docType).toBeNull()
  })

  it.each([
    ["a non-date", "from=vcera"],
    ["a partial date", "from=2026-03"],
    ["a day that does not exist", "from=2026-02-30"],
    ["a month that does not exist", "from=2026-13-01"],
    ["an injection attempt", "from=2026-03-01%27%3B%20DROP"],
  ])("drops %s", (_label, search) => {
    expect(parse(search).filters.from).toBeNull()
  })

  it("drops the upper bound of a reversed range rather than showing nothing", () => {
    const { filters } = parse("from=2026-03-31&to=2026-03-01")
    expect(filters.from).toBe("2026-03-31")
    expect(filters.to).toBeNull()
  })

  it.each([
    ["a non-number", "page=posledni"],
    ["zero", "page=0"],
    ["a negative", "page=-4"],
    ["a fraction", "page=2.5"],
    ["an infinity", "page=1e999"],
  ])("falls back to page 1 for %s", (_label, search) => {
    expect(parse(search).page).toBe(1)
  })

  it("caps the page number", () => {
    expect(parse("page=99999999").page).toBe(10_000)
  })
})

describe("documentListSearchParams", () => {
  it("round-trips a query and omits the defaults", () => {
    const query = parse("status=returned&q=faktura&page=4")
    const round = documentListSearchParams(query)
    expect(round.toString()).toBe("status=returned&q=faktura&page=4")
    expect(parseDocumentListQuery(round)).toEqual(query)
  })

  it("writes nothing at all for an unfiltered first page", () => {
    expect(
      documentListSearchParams({
        filters: EMPTY_DOCUMENT_LIST_FILTERS,
        page: 1,
      }).toString(),
    ).toBe("")
  })

  it("escapes a value that would otherwise break the URL", () => {
    const params = documentListSearchParams({
      filters: {
        ...EMPTY_DOCUMENT_LIST_FILTERS,
        siteRef: "Nové Butovice & co",
      },
      page: 1,
    })
    expect(parseDocumentListQuery(params).filters.siteRef).toBe(
      "Nové Butovice & co",
    )
  })
})

describe("the allowed-value arrays have not drifted from the enums", () => {
  it("offers every status the column can hold", () => {
    expect([...DOCUMENT_STATUS_VALUES].sort()).toEqual(
      [...betaDocumentStatus.enumValues].sort(),
    )
  })

  it("offers every document type except payslip", () => {
    expect([...DOCUMENT_TYPE_VALUES].sort()).toEqual(
      betaDocumentType.enumValues.filter((value) => value !== "payslip").sort(),
    )
  })
})
