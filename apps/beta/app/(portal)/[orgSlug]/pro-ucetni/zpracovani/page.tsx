import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import { listQueueDocuments } from "@/lib/data/documents-office"
import { requireOwner } from "@/lib/data/scope"

import { resolveOrgScope } from "../../_lib/org-scope"
import { DocumentSheet } from "../_components/document-sheet"
import { DOC_TYPE_LABEL_KEY, STATUS_LABEL_KEY } from "../_components/labels"

const ALL_STATUSES = [
  "received",
  "in_processing",
  "processed",
  "returned",
] as const

/**
 * Pro účetní › Zpracování (spec §3.1): the queue of documents awaiting the
 * office, received first, then oldest first — `listQueueDocuments`'s own
 * ORDER BY, not a sort applied here. `?zobrazit=vse` widens it to every
 * status; the default is the queue as the spec defines it (received +
 * in_processing).
 *
 * `requireOwner` runs again here even though `pro-ucetni/layout.tsx` already
 * gated the whole section — `resolveOrgScope` is the SAME cached resolution
 * (same `orgSlug`), so this costs no second query, and it is what makes
 * `owner` a proven `OwnerScope` in THIS file rather than a re-widened
 * `OrgScope` the layout happened to check.
 */
export default async function ZpracovaniPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ zobrazit?: string }>
}) {
  const { orgSlug } = await params
  const { zobrazit } = await searchParams
  const scope = await resolveOrgScope(orgSlug)
  const owner = requireOwner(scope)
  const showAll = zobrazit === "vse"

  const [t, documents] = await Promise.all([
    getBetaTranslations(),
    listQueueDocuments(owner, showAll ? { statuses: ALL_STATUSES } : undefined),
  ])

  return (
    <div className="grid gap-4 p-6">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {t("ucetni.queueTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("ucetni.queueHint")}</p>
      </header>

      <div className="flex gap-2">
        <Button asChild variant={showAll ? "outline" : "default"} size="sm">
          <Link href={`/${orgSlug}/pro-ucetni/zpracovani`}>
            {t("ucetni.filterQueue")}
          </Link>
        </Button>
        <Button asChild variant={showAll ? "default" : "outline"} size="sm">
          <Link href={`/${orgSlug}/pro-ucetni/zpracovani?zobrazit=vse`}>
            {t("ucetni.filterAll")}
          </Link>
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ucetni.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ucetni.columnFile")}</TableHead>
              <TableHead>{t("ucetni.columnType")}</TableHead>
              <TableHead>{t("ucetni.columnStatus")}</TableHead>
              <TableHead>{t("ucetni.columnAmount")}</TableHead>
              <TableHead>{t("ucetni.columnSite")}</TableHead>
              <TableHead>{t("ucetni.columnMessage")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="max-w-64 truncate font-medium">
                  {doc.filename}
                </TableCell>
                <TableCell>{t(DOC_TYPE_LABEL_KEY[doc.docType])}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      doc.status === "returned" ? "destructive" : "secondary"
                    }
                  >
                    {t(STATUS_LABEL_KEY[doc.status])}
                  </Badge>
                </TableCell>
                <TableCell>{doc.amount ?? "—"}</TableCell>
                <TableCell>{doc.siteRef ?? "—"}</TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">
                  {doc.officeMessage ?? "—"}
                </TableCell>
                <TableCell>
                  <DocumentSheet document={doc} orgSlug={orgSlug} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
