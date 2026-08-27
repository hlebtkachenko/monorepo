import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import {
  documentListSearchParams,
  EMPTY_DOCUMENT_LIST_FILTERS,
} from "@/lib/data/document-filters"
import type { DocumentSiteSummary } from "@/lib/data/documents"
import { formatAmount } from "@/lib/format/money"

/**
 * A drill-down from one Stavby group into Vše, pre-filtered to that site.
 *
 * A PURE FUNCTION, EXPORTED AND ITS OWN TESTED UNIT (`stavby-table.test.ts`),
 * separate from the component that renders it — `StavbyTable` below is an
 * async Server Component (it awaits `getBetaTranslations()`), and this repo's
 * render-test pattern (`documents-view.test.tsx`) only exercises "use client"
 * components with `renderToStaticMarkup`. Pulling the URL contract out into a
 * plain function keeps it testable without a next-intl request context.
 *
 * Built through `documentListSearchParams` — the SAME function the Vše filter
 * bar and pager use for every one of their own links — rather than a
 * hand-formatted query string, so this URL is guaranteed to be one
 * `parseDocumentListQuery` reads back as the identical `siteRef` filter.
 */
export function stavbyDrillDownHref(orgSlug: string, siteRef: string): string {
  const params = documentListSearchParams({
    filters: { ...EMPTY_DOCUMENT_LIST_FILTERS, siteRef },
    page: 1,
  })
  return `/${orgSlug}/dokumenty?${params.toString()}`
}

/**
 * The Stavby grouping table (spec §2.2, PR 13): one row per `site_ref`, its
 * document count, its `SUM(amount)`, and a drill-down into Vše pre-filtered
 * to that site.
 *
 * A PLAIN SERVER COMPONENT, unlike `DocumentsTable`. There is no row sheet
 * here — a group is not a document — so there is no client state to hold and
 * therefore no reason for a client bundle.
 *
 * THE UNGROUPED ("bez přiřazené stavby") ROW HAS NO DRILL-DOWN LINK, and that
 * is deliberate rather than an oversight. `DocumentListFilters.siteRef` is an
 * equality filter (`site = 'Vinohrady'`) — the vocabulary has no way to
 * express "site is null", and inventing a sentinel value for it would be a
 * second, undocumented meaning for a filter every other reader of
 * `document-filters.ts` has to know to special-case. So the ungrouped row
 * states its count and sum like every other row and simply renders no action
 * cell; a caller who wants those specific documents already has Vše's own
 * filter-free view.
 */
export async function StavbyTable({
  orgSlug,
  sites,
}: {
  orgSlug: string
  sites: DocumentSiteSummary[]
}) {
  const t = await getBetaTranslations()

  return (
    <Table>
      <TableCaption className="sr-only">
        {t("dokumenty.stavbyTableCaption")}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("dokumenty.stavbyColumnSite")}</TableHead>
          <TableHead className="text-right">
            {t("dokumenty.stavbyColumnCount")}
          </TableHead>
          <TableHead className="text-right">
            {t("dokumenty.stavbyColumnAmount")}
          </TableHead>
          <TableHead className="sr-only">
            {t("dokumenty.stavbyColumnAction")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sites.map((row) => (
          <TableRow key={row.siteRef ?? "__unassigned__"}>
            <TableCell>
              {row.siteRef ?? t("dokumenty.stavbyUngrouped")}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.documentCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatAmount(row.amountTotal) ?? row.amountTotal}
            </TableCell>
            <TableCell className="text-right">
              {row.siteRef !== null ? (
                <Button asChild variant="link" size="sm">
                  <Link href={stavbyDrillDownHref(orgSlug, row.siteRef)}>
                    {t("dokumenty.stavbyOpen")}
                  </Link>
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
