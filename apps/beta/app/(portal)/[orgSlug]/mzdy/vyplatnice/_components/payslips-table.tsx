import Link from "next/link"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { PayslipDocumentView } from "@/lib/data/payslips"
import { formatBetaDate } from "@/lib/format/date"

/**
 * The existing payslips of the selected period (spec §2.6 Výplatnice) — a
 * plain table, the same "no row sheet, no preview" depth
 * `podklady-documents-table.tsx` sets for a Mzdy surface spec's own depth map
 * does not name individually.
 *
 * DOWNLOAD ONLY, THROUGH THE PAYSLIP-SPECIFIC FILE ROUTE
 * (`/api/orgs/[orgSlug]/payroll/payslips/[documentId]/file`) — never
 * `/api/orgs/[orgSlug]/documents/[documentId]/file`, which 404s on a payslip
 * id by design (`documents.ts`'s own `visibleDocuments` filter).
 */
export async function PayslipsTable({
  orgSlug,
  payslips,
}: {
  orgSlug: string
  payslips: readonly PayslipDocumentView[]
}) {
  const t = await getBetaTranslations()

  if (payslips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("mzdy.vyplatniceEmpty")}
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("mzdy.vyplatniceColumnEmployee")}</TableHead>
          <TableHead>{t("mzdy.vyplatniceColumnFile")}</TableHead>
          <TableHead>{t("mzdy.vyplatniceColumnUploaded")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payslips.map((payslip) => (
          <TableRow key={payslip.id}>
            <TableCell className="font-medium">
              {payslip.employeeName}
            </TableCell>
            <TableCell>
              <Link
                href={`/api/orgs/${orgSlug}/payroll/payslips/${payslip.id}/file`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {payslip.filename}
              </Link>
            </TableCell>
            <TableCell>{formatBetaDate(payslip.uploadedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
