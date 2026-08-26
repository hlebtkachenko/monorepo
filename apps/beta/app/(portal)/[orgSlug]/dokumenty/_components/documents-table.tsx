"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { formatAmount, formatDateTime } from "@/i18n/format-values"
import { useBetaTranslations } from "@/i18n/translations"
import type { DocumentSummary } from "@/lib/data/projections"

import { DocumentDetail } from "./document-detail"
import {
  DOCUMENT_STATUS_BADGE_VARIANT,
  DOCUMENT_STATUS_LABEL_KEY,
  DOCUMENT_TYPE_LABEL_KEY,
} from "./labels"

/**
 * The Dokumenty "Vše" table and the row sheet it opens (spec §2.2).
 *
 * COLUMNS, against the spec's list "soubor, nahráno, typ, protistrana, částka,
 * stavba, status, zpráva od účetní": all of them except **protistrana**, which
 * has no column to render — `document.partner_id` and the `partner` table
 * arrive with PR 27, and `DocumentSummary` has no field for it. An always-empty
 * column is a placeholder; PR 27 adds the column with the data behind it.
 *
 * THE ONLY CLIENT COMPONENT ON THIS PAGE, and it holds exactly one piece of
 * state: which row's sheet is open. Everything else — the filters, the pager,
 * the data — is server-rendered and lives in the URL, so a filtered view is a
 * link and the back button works.
 *
 * WHY THE SELECTION IS AN ID AND NOT A ROW. Holding the row object would pin a
 * stale copy open across a filter change; holding the id means the sheet reads
 * from the CURRENT page of rows and closes itself if that row is no longer on
 * it.
 *
 * NO MUTATION AFFORDANCE EXISTS HERE FOR ANY ROLE — no upload, no delete, no
 * status control, not even a disabled one. Uploading is PR 11's surface and
 * every write on a document belongs to the office (spec §3.1/§3.3). A `guest`
 * sees exactly what every other role sees, minus nothing, because there is
 * nothing role-dependent to hide.
 */
export function DocumentsTable({
  documents,
  orgSlug,
}: {
  documents: DocumentSummary[]
  orgSlug: string
}) {
  const t = useBetaTranslations()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const selected = documents.find((row) => row.id === selectedId) ?? null

  return (
    <>
      <Table>
        <TableCaption className="sr-only">
          {t("dokumenty.tableCaption")}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("dokumenty.columnFile")}</TableHead>
            <TableHead>{t("dokumenty.columnUploaded")}</TableHead>
            <TableHead>{t("dokumenty.columnType")}</TableHead>
            <TableHead className="text-right">
              {t("dokumenty.columnAmount")}
            </TableHead>
            <TableHead>{t("dokumenty.columnSite")}</TableHead>
            <TableHead>{t("dokumenty.columnStatus")}</TableHead>
            <TableHead>{t("dokumenty.columnOfficeMessage")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((row) => (
            <TableRow
              key={row.id}
              data-document-id={row.id}
              className="cursor-pointer"
              onClick={() => setSelectedId(row.id)}
            >
              <TableCell className="max-w-64">
                {/* The real control. A clickable <tr> is a mouse convenience;
                    this button is what a keyboard and a screen reader reach,
                    and it carries the row's own accessible name. */}
                <button
                  type="button"
                  aria-label={`${t("dokumenty.openDetail")}: ${row.filename}`}
                  className="block w-full truncate text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedId(row.id)
                  }}
                >
                  {row.filename}
                </button>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                {formatDateTime(row.uploadedAt)}
              </TableCell>
              <TableCell className="text-sm">
                {t(DOCUMENT_TYPE_LABEL_KEY[row.docType])}
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                {formatAmount(row.amount) ?? t("dokumenty.detailEmptyValue")}
              </TableCell>
              <TableCell className="text-sm">
                {row.siteRef ?? t("dokumenty.detailEmptyValue")}
              </TableCell>
              <TableCell>
                <Badge variant={DOCUMENT_STATUS_BADGE_VARIANT[row.status]}>
                  {t(DOCUMENT_STATUS_LABEL_KEY[row.status])}
                </Badge>
              </TableCell>
              <TableCell className="max-w-72 truncate text-sm text-muted-foreground">
                {row.officeMessage ?? t("dokumenty.detailEmptyValue")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8 break-words">
                  {selected.filename}
                </SheetTitle>
                <SheetDescription>
                  {t(DOCUMENT_TYPE_LABEL_KEY[selected.docType])}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <DocumentDetail
                  document={selected}
                  fileUrl={`/api/orgs/${orgSlug}/documents/${selected.id}/file`}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
