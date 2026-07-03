"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
  DetailField,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
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
  AUDIT_ENGAGEMENT_TABS,
  AUDIT_ENGAGEMENTS,
  AUDIT_FINDING_META,
  AUDIT_STAGES,
  AUDIT_STATUS_META,
  formatDate,
  stageIndex,
  type AuditEngagement,
} from "./data"

/**
 * Audit → Engagements. The module's deep surface: a table of engagements whose
 * rows open a `ContentPanel` inspector (side panel on desktop, dialog on mobile
 * — the panel inspector is `max-md:hidden`, so mobile MUST use the dialog). The
 * inspector shows a status timeline, a documents checklist, findings, ETA, and
 * price. In-page tabs filter All / Action needed / Completed. All MOCK. Title
 * "Engagements"; no body `<h1>`.
 */
export function AuditEngagements() {
  const isMobile = useIsMobile()
  const [tab, setTab] = React.useState("all")
  const [inspectedId, setInspectedId] = React.useState<string | null>(null)

  const shown = React.useMemo(() => {
    if (tab === "action") {
      return AUDIT_ENGAGEMENTS.filter((e) => e.status === "Awaiting docs")
    }
    if (tab === "completed") {
      return AUDIT_ENGAGEMENTS.filter((e) => e.status === "Completed")
    }
    return AUDIT_ENGAGEMENTS
  }, [tab])

  const inspected = React.useMemo(
    () => AUDIT_ENGAGEMENTS.find((e) => e.id === inspectedId) ?? null,
    [inspectedId],
  )

  const actionCount = AUDIT_ENGAGEMENTS.filter(
    (e) => e.status === "Awaiting docs",
  ).length

  const tabs: ContentTab[] = AUDIT_ENGAGEMENT_TABS.map((t) => ({
    value: t.value,
    label: t.label,
    badge: t.value === "action" && actionCount > 0 ? actionCount : undefined,
  }))

  const statusBar = (
    <ContentStatusBar
      left={
        <span>
          {shown.length} {shown.length === 1 ? "engagement" : "engagements"}
        </span>
      }
      right={<span>{actionCount} awaiting docs</span>}
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="Engagements"
          tabs={tabs}
          value={tab}
          onValueChange={setTab}
          actions={<PageHeaderActions />}
        />
      </AppPageHeader>
      <ContentPanel
        statusBar={statusBar}
        inspector={
          inspected ? <EngagementDetail engagement={inspected} /> : null
        }
        inspectorOpen={inspected != null}
        inspectorMode={isMobile ? "dialog" : "panel"}
        inspectorTitle={inspected?.company}
        onInspectorOpenChange={(open) => {
          if (!open) setInspectedId(null)
        }}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Company</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Delivery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((engagement) => (
              <EngagementRow
                key={engagement.id}
                engagement={engagement}
                selected={engagement.id === inspectedId}
                onSelect={() => setInspectedId(engagement.id)}
              />
            ))}
          </TableBody>
        </Table>
      </ContentPanel>
    </>
  )
}

function EngagementRow({
  engagement,
  selected,
  onSelect,
}: {
  engagement: AuditEngagement
  selected: boolean
  onSelect: () => void
}) {
  const icons = useIcons()
  const meta = AUDIT_STATUS_META[engagement.status]

  return (
    <TableRow
      onClick={onSelect}
      className={cn("cursor-pointer", selected && "bg-muted/50")}
    >
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          <icons.Building2 className="size-4 text-muted-foreground" />
          {engagement.company}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {engagement.service}
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {engagement.stage}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={meta.badgeVariant}>{engagement.status}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{engagement.period}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatDate(engagement.deliveryEta)}
      </TableCell>
    </TableRow>
  )
}

/* -------------------------------------------------------------------------- */
/* Inspector — timeline + documents + findings + facts.                        */
/* -------------------------------------------------------------------------- */

function EngagementDetail({ engagement }: { engagement: AuditEngagement }) {
  const meta = AUDIT_STATUS_META[engagement.status]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.badgeVariant}>{engagement.status}</Badge>
        <span className="text-sm text-muted-foreground">
          {engagement.service}
        </span>
      </div>

      <StageTimeline current={engagement.stage} />

      <DocumentsChecklist engagement={engagement} />

      <FindingsList engagement={engagement} />

      <dl className="grid grid-cols-2 gap-3">
        <DetailField label="Period" value={engagement.period} />
        <DetailField
          label="Delivery ETA"
          value={formatDate(engagement.deliveryEta)}
        />
        <DetailField
          label="Price"
          value={<span className="tabular-nums">{engagement.price}</span>}
        />
        <DetailField
          label="Last update"
          value={formatDate(engagement.updated)}
        />
      </dl>
    </div>
  )
}

function StageTimeline({ current }: { current: AuditEngagement["stage"] }) {
  const icons = useIcons()
  const currentIndex = stageIndex(current)

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">Progress</h3>
      <ol className="flex flex-col gap-0">
        {AUDIT_STAGES.map((stage, i) => {
          const done = i < currentIndex
          const isCurrent = i === currentIndex
          const last = i === AUDIT_STAGES.length - 1
          return (
            <li key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border",
                    done && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary text-primary",
                    !done &&
                      !isCurrent &&
                      "border-border-subtle text-muted-foreground",
                  )}
                >
                  {done ? (
                    <icons.Check className="size-3" />
                  ) : (
                    <icons.Circle
                      className={cn("size-2", isCurrent && "fill-current")}
                    />
                  )}
                </span>
                {last ? null : (
                  <span
                    className={cn(
                      "min-h-4 w-px flex-1",
                      done ? "bg-primary" : "bg-border-subtle",
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "pb-3 text-sm",
                  isCurrent
                    ? "font-medium text-foreground"
                    : done
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {stage}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function DocumentsChecklist({ engagement }: { engagement: AuditEngagement }) {
  const icons = useIcons()
  const docs = engagement.documentsRequested
  const receivedCount = docs.filter((d) => d.received).length

  if (docs.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Documents</h3>
        <p className="text-sm text-muted-foreground">
          No documents requested yet.
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Documents</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {receivedCount}/{docs.length} received
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {docs.map((doc) => (
          <li key={doc.label} className="flex items-center gap-2 text-sm">
            {doc.received ? (
              <icons.CheckCircle2 className="size-4 shrink-0 text-primary" />
            ) : (
              <icons.Circle className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "min-w-0",
                doc.received ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {doc.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FindingsList({ engagement }: { engagement: AuditEngagement }) {
  const findings = engagement.findings

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">Findings</h3>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings raised yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {findings.map((finding, i) => {
            const meta = AUDIT_FINDING_META[finding.severity]
            return (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-border-subtle p-2 text-sm"
              >
                <Badge variant={meta.badgeVariant} className="shrink-0">
                  {meta.label}
                </Badge>
                <span className="min-w-0">{finding.note}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
