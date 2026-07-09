import type { KhAggregate, KhRow } from "@workspace/accounting"
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
import type { VatControlStatementResult } from "../_lib/vat-data"
import { FilingPeriodSelector } from "./filing-period-selector"
import { VatEvidenceAlert } from "./vat-evidence-alert"
import { VatStatusMessage } from "./vat-status-message"

function KhRowsSection({ title, rows }: { title: string; rows: KhRow[] }) {
  if (rows.length === 0) return null
  return (
    <Card className="p-0">
      <CardHeader className="px-4 pt-4">
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>DIČ</TableHead>
              <TableHead>Doklad</TableHead>
              <TableHead>DPPD</TableHead>
              <TableHead>Kód</TableHead>
              <TableHead className="text-right">Základ 21 %</TableHead>
              <TableHead className="text-right">Daň 21 %</TableHead>
              <TableHead className="text-right">Základ 12 %</TableHead>
              <TableHead className="text-right">Daň 12 %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={`${row.doklad}-${i}`}>
                <TableCell>{row.tax_id ?? "—"}</TableCell>
                <TableCell>{row.doklad}</TableCell>
                <TableCell className="tabular-nums">{row.dppd}</TableCell>
                <TableCell>{row.kod ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDecimal(row.base21)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDecimal(row.dan21)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDecimal(row.base12)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDecimal(row.dan12)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function KhAggregateSection({
  title,
  aggregate,
}: {
  title: string
  aggregate: KhAggregate
}) {
  if (aggregate.count === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Počet dokladů</span>
          <span className="tabular-nums">{aggregate.count}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Základ</span>
          <span className="tabular-nums">{formatDecimal(aggregate.base)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Daň</span>
          <span className="tabular-nums">{formatDecimal(aggregate.dan)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Control statement (kontrolní hlášení) — the selected filing period's real
 * row-level sections from `buildKontrolniHlaseni` (A.1/A.2/A.4/B.1/B.2 per
 * doklad, A.5/B.3 aggregated). Real computed rows only: an empty filing
 * period shows an honest "No VAT movements" state, not empty section shells.
 */
export function KhView({
  slug,
  data,
}: {
  slug: string
  data: VatControlStatementResult
}) {
  const hasMovement =
    data.status === "ok" &&
    (data.kh.a1.length > 0 ||
      data.kh.a2.length > 0 ||
      data.kh.a4.length > 0 ||
      data.kh.a5.count > 0 ||
      data.kh.b1.length > 0 ||
      data.kh.b2.length > 0 ||
      data.kh.b3.count > 0)

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Control statement" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <VatStatusMessage slug={slug} data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <FilingPeriodSelector
                basePath={`/${slug}/closing/vat/kh`}
                filingPeriods={data.filingPeriods}
                selectedFrom={data.selected.from}
              />
              <p className="text-sm text-muted-foreground">
                {data.selected.label}
              </p>
              <VatEvidenceAlert completeness={data.kh.completeness} />

              {hasMovement ? (
                <>
                  <KhRowsSection
                    title="A.1 – Uskutečněná plnění v režimu přenesení daňové povinnosti (dodavatel)"
                    rows={data.kh.a1}
                  />
                  <KhRowsSection
                    title="A.2 – Přijatá plnění s místem plnění v tuzemsku od osoby registrované v jiném členském státě"
                    rows={data.kh.a2}
                  />
                  <KhRowsSection
                    title="A.4 – Uskutečněná zdanitelná plnění nad 10 000 Kč s DIČ odběratele"
                    rows={data.kh.a4}
                  />
                  <KhAggregateSection
                    title="A.5 – Ostatní uskutečněná zdanitelná plnění"
                    aggregate={data.kh.a5}
                  />
                  <KhRowsSection
                    title="B.1 – Přijatá plnění v režimu přenesení daňové povinnosti (odběratel)"
                    rows={data.kh.b1}
                  />
                  <KhRowsSection
                    title="B.2 – Přijatá zdanitelná plnění nad 10 000 Kč s DIČ"
                    rows={data.kh.b2}
                  />
                  <KhAggregateSection
                    title="B.3 – Ostatní přijatá zdanitelná plnění"
                    aggregate={data.kh.b3}
                  />
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
