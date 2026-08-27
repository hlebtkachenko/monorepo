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
import {
  canUploadDocuments,
  listDocumentSites,
  listDocuments,
} from "@/lib/data/documents"

import { resolveOrgScope } from "../_lib/org-scope"

import { DocumentsFilters } from "./_components/documents-filters"
import { DocumentsPager } from "./_components/documents-pager"
import { DocumentsTable } from "./_components/documents-table"
import { UploadPanel } from "./_components/upload-panel"

/**
 * Dokumenty › Vše (`/[orgSlug]/dokumenty`) — spec §2.2.
 *
 * A SERVER COMPONENT THAT OWNS THE WHOLE READ. The filters and the page number
 * arrive as `searchParams`, are validated once by `parseDocumentListQuery`, and
 * go straight into the SQL — nothing is filtered in the browser, so a page is a
 * page of the FILTERED list and rows the client narrowed away never cross the
 * wire. `listDocuments` and `listDocumentSites` both take the `OrgScope` this
 * tree already resolved, so neither can be reached without a live membership,
 * and both carry the four visibility filters of `lib/data/documents.ts`.
 *
 * THE UPLOAD PANEL IS THE ONE WRITE ON THIS PAGE, and it is RENDERED OR ABSENT
 * — never disabled. Spec §2.0.1 is explicit for the guest seat: "upload
 * affordances absent (not disabled)". A greyed-out "Nahrát" is a promise made to
 * someone who will never be able to keep it, and it also tells them a capability
 * exists that they are being denied. `canUploadDocuments` decides here; the
 * route decides again, independently, for every request (403 for a guest) — this
 * is the honest reflection of that rule, not its enforcement.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT HAVE:
 *   - a title header or the Vše / Doklady firmy / Stavby tab row — both moved
 *     to `../layout.tsx` (PR 13), which every sibling tab shares;
 *   - any write on a document ROW. Fields, status and messages are the office's
 *     (spec §3.3); uploading a new file is the client's, and that is the whole
 *     difference.
 *
 * `dynamic` is not set: every read below already depends on `headers()` through
 * the session, so the route is dynamic by construction. Saying so twice would be
 * a claim that could drift from the truth.
 */
export default async function DokumentyPage({
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

  // The same `cache()`-wrapped resolution the layout already made for this
  // request — a memoized read, not a second round trip (`_lib/org-scope.ts`).
  const scope = await resolveOrgScope(orgSlug)

  // Every link, form action and file URL below is built from the CANONICAL
  // slug the database returned, never from the one in the URL bar. They are
  // equal here by construction — `resolveOrgScope` matches on equality — but
  // "equal by construction" is a property of today's query, and reflecting
  // request input back into an href is the habit worth not having.
  const slug = scope.organizationSlug

  const [t, page, sites] = await Promise.all([
    getBetaTranslations(),
    listDocuments(scope, query),
    listDocumentSites(scope),
  ])

  const filtered = hasActiveFilters(query.filters)
  const canUpload = canUploadDocuments(scope)

  return (
    <>
      {canUpload ? <UploadPanel orgSlug={slug} /> : null}

      {/* The filter bar is worth rendering on an empty book only when it is
          what emptied it — otherwise it is six controls above nothing. */}
      {page.total > 0 || filtered ? (
        <DocumentsFilters
          orgSlug={slug}
          filters={query.filters}
          sites={sites}
        />
      ) : null}

      {page.documents.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {filtered
                ? t("dokumenty.emptyFilteredTitle")
                : t("dokumenty.emptyTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? t("dokumenty.emptyFilteredBody")
                : // A plain `guest` cannot upload (spec §5), so telling them to
                  // would be an instruction they cannot follow. The employee
                  // seat of §2.6.1 is the one guest that CAN — it uploads its
                  // own podklady — and `canUploadDocuments` already carries
                  // that distinction, so this reads the answer rather than the
                  // role.
                  canUpload
                  ? t("dokumenty.emptyBody")
                  : t("dokumenty.emptyBodyReadOnly")}
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
      />
    </>
  )
}
