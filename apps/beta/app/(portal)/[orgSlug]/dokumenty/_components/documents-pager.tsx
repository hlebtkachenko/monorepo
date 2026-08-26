import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { getBetaTranslations } from "@/i18n/translations-server"
import {
  documentListSearchParams,
  type DocumentListFilters,
} from "@/lib/data/document-filters"

/**
 * The pager under the Dokumenty table.
 *
 * TWO LINKS, NOT A WIDGET. Server-rendered `<Link>`s carrying the SAME filters
 * with a different `page`, so a page of a filtered list is a real URL: the back
 * button works, a refresh stays put, and there is no client state that can
 * disagree with what the table is showing.
 *
 * `total` and `pageCount` come from the same statement that produced the rows
 * (`count(*) over ()` in `listDocuments`), so the summary can never describe a
 * different result set than the one above it.
 *
 * Renders nothing at all when everything fits on one page — a pager that says
 * "Strana 1 z 1" is noise on the surface a client visits most.
 */
export async function DocumentsPager({
  orgSlug,
  filters,
  page,
  pageCount,
  total,
}: {
  orgSlug: string
  filters: DocumentListFilters
  page: number
  pageCount: number
  total: number
}) {
  const t = await getBetaTranslations()
  if (pageCount <= 1) return null

  const href = (target: number): string => {
    const params = documentListSearchParams({ filters, page: target })
    const query = params.toString()
    return query ? `/${orgSlug}/dokumenty?${query}` : `/${orgSlug}/dokumenty`
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label={t("dokumenty.pagerPage")}
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("dokumenty.pagerTotal")}: {total} · {t("dokumenty.pagerPage")} {page}{" "}
        {t("dokumenty.pagerOf")} {pageCount}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="lg">
            <Link href={href(page - 1)} rel="prev">
              {t("dokumenty.pagerPrevious")}
            </Link>
          </Button>
        ) : null}
        {page < pageCount ? (
          <Button asChild variant="outline" size="lg">
            <Link href={href(page + 1)} rel="next">
              {t("dokumenty.pagerNext")}
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  )
}
