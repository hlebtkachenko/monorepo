import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { getBetaTranslations } from "@/i18n/translations-server"
import {
  hasActiveFilters,
  parseDocumentListQuery,
} from "@/lib/data/document-filters"
import { listCompanyDocuments } from "@/lib/data/documents"

import { resolveOrgScope } from "../../_lib/org-scope"
import { DocumentsFilters } from "../_components/documents-filters"
import { DocumentsPager } from "../_components/documents-pager"
import { DocumentsTable } from "../_components/documents-table"

/**
 * Dokumenty › Doklady firmy (`/[orgSlug]/dokumenty/firma`) — spec §2.2:
 * "smlouva / zápis-výpis / plná moc / ostatní; office-uploaded."
 *
 * THE SAME TABLE, THE SAME SHEET, A FIXED CATEGORY. This route is
 * `DokumentyPage` (Vše) with one difference: `listCompanyDocuments` narrows
 * `doc_type` to `COMPANY_DOCUMENT_TYPES` (`contract` + `other` — see that
 * constant's own header comment on why the DB has no value for the other two
 * spec-named kinds). Everything else — columns, the row sheet, the sandboxed
 * preview, the office-message field, the complete absence of any write
 * affordance — is `DocumentsTable`/`DocumentDetail` unchanged, because a
 * company document is still a `document` row and every rule PR 12 built for
 * one still applies to this subset of them.
 *
 * "office-uploaded" (spec §2.2) describes who TYPICALLY puts these rows on the
 * book, not a filter this page enforces — `uploaded_by_user_id` is not part of
 * `visibleDocuments()`, and a client uploading a `contract` through PR 11's
 * flow (once it ships) would correctly show up here too. Narrowing further
 * would be inventing a rule the spec does not state.
 *
 * No `type` dropdown in the filter bar (`showTypeFilter={false}`): the whole
 * point of this tab is that the type is already fixed.
 */
export default async function DokumentyFirmaPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ orgSlug }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const query = parseDocumentListQuery(rawSearchParams)

  const scope = await resolveOrgScope(orgSlug)
  const slug = scope.organizationSlug
  const basePath = `/${slug}/dokumenty/firma`

  const [t, page] = await Promise.all([
    getBetaTranslations(),
    listCompanyDocuments(scope, query),
  ])

  const filtered = hasActiveFilters(query.filters)

  return (
    <>
      {page.total > 0 || filtered ? (
        <DocumentsFilters
          orgSlug={slug}
          filters={query.filters}
          sites={[]}
          basePath={basePath}
          showTypeFilter={false}
        />
      ) : null}

      {page.documents.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {filtered
                ? t("dokumenty.emptyFilteredTitle")
                : t("dokumenty.firmaEmptyTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? t("dokumenty.emptyFilteredBody")
                : t("dokumenty.firmaEmptyBody")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DocumentsTable documents={page.documents} orgSlug={slug} />
      )}

      <DocumentsPager
        orgSlug={slug}
        filters={query.filters}
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        basePath={basePath}
      />
    </>
  )
}
