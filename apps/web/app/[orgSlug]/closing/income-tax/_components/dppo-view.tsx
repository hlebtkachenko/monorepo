import type { Dppo } from "@workspace/accounting"
import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import { Card, CardContent } from "@workspace/ui/components/card"
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
import type { CorporateIncomeTaxResult } from "../_lib/income-tax-data"
import { AnnualStatusMessage } from "../../_components/annual-status-message"
import { AnnualCompletenessAlert } from "../../_components/annual-completeness-alert"
import { DppoAdjustmentsDialog } from "./dppo-adjustments-dialog"

/** One DPPO computation line — `sazba` is a rate (§21), every other field is a Kč amount. */
interface DppoLine {
  key:
    | "ucetni_vysledek"
    | "nedanove_naklady"
    | "osvobozene_vynosy"
    | "zaklad_dane"
    | "odpocet_ztraty"
    | "zaklad_zaokrouhleny"
    | "sazba"
    | "dan"
    | "slevy"
    | "dan_po_slevach"
    | "zalohy"
    | "doplatek"
  label: string
  format?: "rate"
}

const DPPO_LINES: DppoLine[] = [
  { key: "ucetni_vysledek", label: "Účetní výsledek hospodaření (§23/2)" },
  { key: "nedanove_naklady", label: "Daňově neuznatelné náklady (§25)" },
  {
    key: "osvobozene_vynosy",
    label: "Osvobozené / nezahrnované výnosy (§18a, §19)",
  },
  { key: "zaklad_dane", label: "Základ daně (§23/1)" },
  {
    key: "odpocet_ztraty",
    label: "Odpočet daňové ztráty minulých let (§34)",
  },
  {
    key: "zaklad_zaokrouhleny",
    label: "Základ daně zaokrouhlený na celé tisíce Kč (§21)",
  },
  { key: "sazba", label: "Sazba daně", format: "rate" },
  { key: "dan", label: "Daň" },
  { key: "slevy", label: "Slevy na dani (§35)" },
  { key: "dan_po_slevach", label: "Daň po slevách" },
  { key: "zalohy", label: "Zaplacené zálohy (§38a)" },
  { key: "doplatek", label: "Doplatek / přeplatek" },
]

/** `Decimal` rate ("0.2100") -> "21 %" — display formatting only, no money math. */
function formatRate(value: string): string {
  const n = Number(value)
  return `${(n * 100).toFixed(0)} %`
}

function formatDppoValue(dppo: Dppo, line: DppoLine): string {
  const value = dppo[line.key]
  if (value == null) return "Needs input"
  return line.format === "rate" ? formatRate(value) : formatDecimal(value)
}

type OkResult = Extract<CorporateIncomeTaxResult, { status: "ok" }>

/**
 * Corporation tax (DPPO — daň z příjmů právnických osob, Act 586/1992 Sb.) —
 * the active accounting period's real computed figures from `buildDppo`.
 * Annual: one computation per period, no filing-period picker (unlike VAT).
 * Server-rendered read-only worksheet; owners/admins get a client edit dialog
 * ({@link DppoAdjustmentsDialog}) mounted alongside it.
 */
export function DppoView({ data }: { data: CorporateIncomeTaxResult }) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Corporation tax" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <AnnualStatusMessage data={data} />
          ) : (
            <DppoWorksheet data={data} />
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}

/** The read-only worksheet + (owner/admin only) the client adjustments editor. */
function DppoWorksheet({ data }: { data: OkResult }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{data.periodLabel}</p>

      <AnnualCompletenessAlert completeness={data.dppo.completeness} />

      <Card className="p-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DPPO_LINES.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>{line.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDppoValue(data.dppo, line)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.canEdit ? (
        <div className="flex items-center justify-end">
          <DppoAdjustmentsDialog
            slug={data.slug}
            periodId={data.periodId}
            dppo={data.dppo}
          />
        </div>
      ) : null}
    </div>
  )
}
