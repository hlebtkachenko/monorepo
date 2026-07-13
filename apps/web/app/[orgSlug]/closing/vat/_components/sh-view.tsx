import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/content-panel"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { formatDecimal } from "../../../../_components/_shared/accounting-format"
import type { VatEcSalesListResult } from "../_lib/vat-data"
import { FilingPeriodSelector } from "./filing-period-selector"
import { VatEvidenceAlert } from "./vat-evidence-alert"
import { VatStatusMessage } from "./vat-status-message"

/** kód plnění (Pokyny k SH) — see souhrnne-hlaseni.ts module doc. */
const KOD_PLNENI_LABEL: Record<string, string> = {
  "0": "0 – dodání zboží (§64)",
  "1": "1 – přemístění obchodního majetku",
  "2": "2 – třístranný obchod (§17)",
  "3": "3 – poskytnutí služby (§9 odst. 1)",
}

/**
 * EC Sales List (souhrnné hlášení) — the selected filing period's real rows
 * from `buildSouhrnneHlaseni` (one line per counterparty + kód plnění). Real
 * computed rows only: no EU supplies in the filing period shows an honest
 * "No VAT movements" state, not an empty form shell.
 */
export function ShView({
  slug,
  data,
}: {
  slug: string
  data: VatEcSalesListResult
}) {
  const rows = data.status === "ok" ? data.sh.rows : []

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="EC Sales List worksheet" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <VatStatusMessage slug={slug} data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <FilingPeriodSelector
                basePath={`/${slug}/closing/vat/sh`}
                filingPeriods={data.filingPeriods}
                selectedFrom={data.selected.from}
              />
              <p className="text-sm text-muted-foreground">
                {data.selected.label}
              </p>
              <VatEvidenceAlert completeness={data.sh.completeness} />

              {rows.length > 0 ? (
                <Card className="p-0">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Country</TableHead>
                          <TableHead>VAT ID</TableHead>
                          <TableHead>Kód plnění</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row, i) => (
                          <TableRow
                            key={`${row.tax_id}-${row.kod_plneni}-${i}`}
                          >
                            <TableCell>{row.country_code ?? "—"}</TableCell>
                            <TableCell>{row.tax_id ?? "—"}</TableCell>
                            <TableCell>
                              {KOD_PLNENI_LABEL[row.kod_plneni] ??
                                row.kod_plneni}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.count}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatDecimal(row.value)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    No VAT movements in this filing period.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
