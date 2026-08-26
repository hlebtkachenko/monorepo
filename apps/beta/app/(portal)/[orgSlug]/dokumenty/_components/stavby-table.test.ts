/**
 * The Stavby drill-down URL contract (spec §2.2, PR 13).
 *
 * `stavbyDrillDownHref` is a pure function pulled out of the `StavbyTable`
 * Server Component specifically so it is testable here without a next-intl
 * request context — see the function's own header comment.
 */
import { describe, expect, it } from "vitest"

import {
  EMPTY_DOCUMENT_LIST_FILTERS,
  parseDocumentListQuery,
} from "@/lib/data/document-filters"

import { stavbyDrillDownHref } from "./stavby-table"

describe("stavbyDrillDownHref", () => {
  it("targets Vše, not Firma or Stavby itself", () => {
    const href = stavbyDrillDownHref("acme-sro", "Vinohrady")
    expect(href.startsWith("/acme-sro/dokumenty?")).toBe(true)
    expect(href).not.toContain("/dokumenty/firma")
    expect(href).not.toContain("/dokumenty/stavby")
  })

  it("round-trips through the document-filters parser to the SAME siteRef, and nothing else", () => {
    const href = stavbyDrillDownHref("acme-sro", "Vinohrady")
    const [, query] = href.split("?")
    const { filters, page } = parseDocumentListQuery(new URLSearchParams(query))
    expect(filters).toEqual({
      ...EMPTY_DOCUMENT_LIST_FILTERS,
      siteRef: "Vinohrady",
    })
    expect(page).toBe(1)
  })

  it("survives a site name with characters a URL would otherwise mangle", () => {
    const href = stavbyDrillDownHref("acme-sro", "Nové Butovice & spol.")
    const [, query] = href.split("?")
    const { filters } = parseDocumentListQuery(new URLSearchParams(query))
    expect(filters.siteRef).toBe("Nové Butovice & spol.")
  })

  it("carries no page number for the first page, matching the pager's own convention", () => {
    const href = stavbyDrillDownHref("acme-sro", "Vinohrady")
    expect(href).not.toContain("page=")
  })
})
