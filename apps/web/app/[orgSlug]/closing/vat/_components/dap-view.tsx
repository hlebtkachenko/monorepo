import type { DphRows } from "@workspace/accounting"
import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AppPageHeader } from "../../../../_components/app-page-header"
import { formatDecimal } from "../../../../_components/_shared/accounting-format"
import type { VatReturnResult } from "../_lib/vat-data"
import { FilingPeriodSelector } from "./filing-period-selector"
import { VatEvidenceAlert } from "./vat-evidence-alert"
import { VatStatusMessage } from "./vat-status-message"

/** One přiznání line: the base-amount field, and the daň field when the line carries VAT (base-only lines — ř.20/21/25/50 — omit `dan`). */
interface DapLine {
  base: keyof DphRows
  dan?: keyof DphRows
  label: string
}

const DAP_LINES: DapLine[] = [
  {
    base: "r1_base",
    dan: "r1_dan",
    label: "ř.1 – Dodání zboží nebo poskytnutí služby, základní sazba 21 %",
  },
  {
    base: "r2_base",
    dan: "r2_dan",
    label: "ř.2 – Dodání zboží nebo poskytnutí služby, snížená sazba 12 %",
  },
  {
    base: "r3_base",
    dan: "r3_dan",
    label: "ř.3 – Pořízení zboží z jiného členského státu, sazba 21 %",
  },
  {
    base: "r4_base",
    dan: "r4_dan",
    label: "ř.4 – Pořízení zboží z jiného členského státu, sazba 12 %",
  },
  {
    base: "r5_base",
    dan: "r5_dan",
    label:
      "ř.5 – Přijetí služby od osoby registrované v jiném členském státě, sazba 21 %",
  },
  {
    base: "r6_base",
    dan: "r6_dan",
    label:
      "ř.6 – Přijetí služby od osoby registrované v jiném členském státě, sazba 12 %",
  },
  {
    base: "r10_base",
    dan: "r10_dan",
    label:
      "ř.10 – Přijetí zdanitelného plnění (režim přenesení daňové povinnosti), sazba 21 %",
  },
  {
    base: "r11_base",
    dan: "r11_dan",
    label:
      "ř.11 – Přijetí zdanitelného plnění (režim přenesení daňové povinnosti), sazba 12 %",
  },
  {
    base: "r12_base",
    dan: "r12_dan",
    label:
      "ř.12 – Ostatní zdanitelná plnění, u kterých je povinnost přiznat daň při jejich přijetí (§108), sazba 21 %",
  },
  {
    base: "r13_base",
    dan: "r13_dan",
    label:
      "ř.13 – Ostatní zdanitelná plnění, u kterých je povinnost přiznat daň při jejich přijetí (§108), sazba 12 %",
  },
  {
    base: "r20_base",
    label: "ř.20 – Dodání zboží do jiného členského státu (§64)",
  },
  {
    base: "r21_base",
    label:
      "ř.21 – Poskytnutí služby s místem plnění v jiném členském státě (§9 odst. 1)",
  },
  {
    base: "r22_base",
    label: "ř.22 – Vývoz zboží (§66)",
  },
  {
    base: "r25_base",
    label: "ř.25 – Dodání s režimem přenesení daňové povinnosti (§92a)",
  },
  {
    base: "r40_base",
    dan: "r40_dan",
    label: "ř.40 – Přijatá zdanitelná plnění (odpočet), sazba 21 %",
  },
  {
    base: "r41_base",
    dan: "r41_dan",
    label: "ř.41 – Přijatá zdanitelná plnění (odpočet), sazba 12 %",
  },
  {
    base: "r43_base",
    dan: "r43_dan",
    label: "ř.43 – Odpočet daně u samovyměření, sazba 21 %",
  },
  {
    base: "r44_base",
    dan: "r44_dan",
    label: "ř.44 – Odpočet daně u samovyměření, sazba 12 %",
  },
  {
    base: "r50_base",
    label: "ř.50 – Plnění osvobozená od daně bez nároku na odpočet daně",
  },
]

function isPopulated(rows: DphRows, line: DapLine): boolean {
  if (Number(rows[line.base]) !== 0) return true
  return line.dan != null && Number(rows[line.dan]) !== 0
}

/**
 * VAT return (přiznání k DPH) — the selected filing period's přiznání lines
 * from `buildDph`, every populated line with its statutory Czech label, plus
 * the vlastní daň totals. Real computed figures only: an empty filing period
 * shows an honest "No VAT movements" state, not a zeroed-out form.
 */
export function DapView({
  slug,
  data,
}: {
  slug: string
  data: VatReturnResult
}) {
  const populated =
    data.status === "ok"
      ? DAP_LINES.filter((line) => isPopulated(data.dph.rows, line))
      : []

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="VAT return worksheet" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <VatStatusMessage slug={slug} data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <FilingPeriodSelector
                basePath={`/${slug}/closing/vat/dap`}
                filingPeriods={data.filingPeriods}
                selectedFrom={data.selected.from}
              />
              <p className="text-sm text-muted-foreground">
                {data.selected.label}
              </p>
              <VatEvidenceAlert completeness={data.dph.completeness} />

              {populated.length > 0 ? (
                <>
                  <Card className="p-0">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Line</TableHead>
                            <TableHead className="text-right">Základ</TableHead>
                            <TableHead className="text-right">Daň</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {populated.map((line) => (
                            <TableRow key={line.base}>
                              <TableCell>{line.label}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatDecimal(data.dph.rows[line.base])}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {line.dan != null
                                  ? formatDecimal(data.dph.rows[line.dan])
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h3>Totals</h3>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Daň na výstupu celkem
                        </span>
                        <span className="tabular-nums">
                          {formatDecimal(data.dph.rows.dan_na_vystupu)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Odpočet daně celkem
                        </span>
                        <span className="tabular-nums">
                          {formatDecimal(data.dph.rows.odpocet)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-medium">
                        <span>Vlastní daň / nadměrný odpočet</span>
                        <span className="tabular-nums">
                          {formatDecimal(data.dph.rows.vlastni_dan)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </>
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
