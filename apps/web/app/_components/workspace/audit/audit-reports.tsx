"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  DetailField,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { AppPageHeader } from "../../app-page-header"
import { PageHeaderActions } from "../../_shared/content-header-extras"
import {
  AUDIT_REPORT_KIND_META,
  AUDIT_REPORTS,
  formatDate,
  type AuditReport,
} from "./data"

/**
 * Audit → Reports. A table of delivered documents (title / company / kind /
 * date / download) with an All ↔ Archive toggle (preserves the existing
 * `showArchived` behavior) and a lightweight preview inspector opened by
 * clicking a row. All MOCK. Title "Reports"; no body `<h1>`.
 */
export function AuditReports() {
  const icons = useIcons()
  const isMobile = useIsMobile()
  const [showArchived, setShowArchived] = React.useState(false)
  const [inspectedId, setInspectedId] = React.useState<string | null>(null)

  const shown = showArchived
    ? AUDIT_REPORTS
    : AUDIT_REPORTS.filter((r) => !r.archived)
  const archivedCount = AUDIT_REPORTS.filter((r) => r.archived).length

  const inspected = React.useMemo(
    () => AUDIT_REPORTS.find((r) => r.id === inspectedId) ?? null,
    [inspectedId],
  )

  const toolbar = (
    <ContentToolbar
      left={
        <span className="text-xs text-muted-foreground">
          Reports, certificates, and working papers delivered by Afframe.
        </span>
      }
      right={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          <icons.Archive />
          {showArchived ? "Hide archive" : `Show archive (${archivedCount})`}
        </Button>
      }
    />
  )

  const statusBar = (
    <ContentStatusBar
      left={
        <span>
          {shown.length} {shown.length === 1 ? "document" : "documents"}
        </span>
      }
      right={<span>{archivedCount} archived</span>}
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Reports" actions={<PageHeaderActions />} />
      </AppPageHeader>
      <ContentPanel
        toolbar={toolbar}
        statusBar={statusBar}
        inspector={inspected ? <ReportDetail report={inspected} /> : null}
        inspectorOpen={inspected != null}
        inspectorMode={isMobile ? "dialog" : "panel"}
        inspectorTitle={inspected?.title}
        onInspectorOpenChange={(open) => {
          if (!open) setInspectedId(null)
        }}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Date</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                selected={report.id === inspectedId}
                onSelect={() => setInspectedId(report.id)}
              />
            ))}
          </TableBody>
        </Table>
      </ContentPanel>
    </>
  )
}

function ReportRow({
  report,
  selected,
  onSelect,
}: {
  report: AuditReport
  selected: boolean
  onSelect: () => void
}) {
  const icons = useIcons()
  const meta = AUDIT_REPORT_KIND_META[report.kind]

  return (
    <TableRow
      onClick={onSelect}
      className={cn(
        "cursor-pointer",
        report.archived && "text-muted-foreground",
        selected && "bg-muted/50",
      )}
    >
      <TableCell className="max-w-xs font-medium">
        <span className="flex items-center gap-2">
          <icons.FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{report.title}</span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{report.company}</TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <Badge variant={meta.badgeVariant}>{report.kind}</Badge>
          {report.archived ? <Badge variant="ghost">Archived</Badge> : null}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatDate(report.date)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={(event) => {
            event.stopPropagation()
            toast.info(`Downloading ${report.title}…`)
          }}
        >
          <icons.Download />
          Download
        </Button>
      </TableCell>
    </TableRow>
  )
}

/* -------------------------------------------------------------------------- */
/* Inspector — a lightweight document preview.                                 */
/* -------------------------------------------------------------------------- */

function ReportDetail({ report }: { report: AuditReport }) {
  const icons = useIcons()
  const meta = AUDIT_REPORT_KIND_META[report.kind]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <icons.FileText className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">{report.title}</span>
          <span className="flex items-center gap-2">
            <Badge variant={meta.badgeVariant}>{report.kind}</Badge>
            {report.archived ? <Badge variant="ghost">Archived</Badge> : null}
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-3">
        <DetailField label="Company" value={report.company} />
        <DetailField label="Kind" value={report.kind} />
        <DetailField label="Delivered" value={formatDate(report.date)} />
      </dl>

      <Button
        className="w-full"
        onClick={() => toast.info(`Downloading ${report.title}…`)}
      >
        <icons.Download />
        Download
      </Button>
    </div>
  )
}
