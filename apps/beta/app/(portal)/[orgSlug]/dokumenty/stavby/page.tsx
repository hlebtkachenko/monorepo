import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { getBetaTranslations } from "@/i18n/translations-server"
import { listDocumentSiteSummaries } from "@/lib/data/documents"

import { assertNotEmployeeSeat } from "@/lib/data/scope"

import { resolveOrgScope } from "../../_lib/org-scope"
import { StavbyTable } from "../_components/stavby-table"

/**
 * Dokumenty › Stavby (`/[orgSlug]/dokumenty/stavby`) — spec §2.2: "per-site_ref
 * groups, counts + SQL sums → filtered Vše."
 *
 * `listDocumentSiteSummaries` GROUPs on the database side (count + SUM), so
 * this page does no arithmetic of its own — the SQL-only-sums rule (spec §0.2,
 * §0.7) holds here exactly as it holds for Vše's list and Daně's YTD rollup.
 *
 * EMPTY IFF THE BOOK HAS NO VISIBLE DOCUMENTS AT ALL. `GROUP BY site_ref`
 * always produces at least one row — the `NULL` bucket — the moment a single
 * visible document exists, whether or not any of them carry a `stavba`. So an
 * empty array here means the same thing `DokumentyPage`'s unfiltered empty
 * state means: nothing has been uploaded, or nothing on this book is visible
 * to this caller yet.
 */
export default async function DokumentyStavbyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  // Company paperwork, not this person's (spec §2.6.1). The tab is filtered
  // out for a seat (`DOKUMENTY_SEAT_NAV`); this is the enforcement.
  assertNotEmployeeSeat(scope)
  const slug = scope.organizationSlug

  const [t, sites] = await Promise.all([
    getBetaTranslations(),
    listDocumentSiteSummaries(scope),
  ])

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("dokumenty.stavbyIntro")}
      </p>

      {sites.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("dokumenty.stavbyEmptyTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("dokumenty.stavbyEmptyBody")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <StavbyTable orgSlug={slug} sites={sites} />
      )}
    </>
  )
}
