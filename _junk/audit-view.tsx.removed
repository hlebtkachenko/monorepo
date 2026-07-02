"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { AppPageHeader } from "../../app-page-header"
import { PageHeaderActions } from "../../_shared/content-header-extras"
import {
  AUDIT_ENGAGEMENTS,
  AUDIT_MESSAGES,
  AUDIT_REPORT_KIND_META,
  AUDIT_REPORTS,
  AUDIT_SERVICES,
  AUDIT_STATUS_META,
  AUDIT_TABS,
  formatDate,
  type AuditEngagement,
  type AuditMessage,
  type AuditReport,
  type AuditService,
} from "./data"

/**
 * Audit — the workspace-tier hub for Afframe's paid accounting-audit add-ons.
 * A single `"use client"` view that portals its title + tabs into the shell
 * header via `AppPageHeader` and switches a `ContentPanel` body across four
 * tabs (Services / Engagements / Messages / Reports). Entirely MOCK — every
 * array is a static deterministic fixture and every action is a `toast` stub.
 *
 * The content-header title is "Overview" (NOT "Audit"): the sidebar module h2
 * already says "Audit", so the content title must differ to avoid duplication.
 * There is no body `<h1>`.
 */
export function AuditView() {
  const [tab, setTab] = React.useState("services")

  const tabs: ContentTab[] = AUDIT_TABS.map((t) => ({
    value: t.value,
    label: t.label,
    badge:
      t.value === "engagements"
        ? AUDIT_ENGAGEMENTS.length
        : t.value === "reports"
          ? AUDIT_REPORTS.filter((r) => !r.archived).length
          : undefined,
  }))

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="Overview"
          tabs={tabs}
          value={tab}
          onValueChange={setTab}
          actions={<PageHeaderActions />}
        />
      </AppPageHeader>

      {tab === "services" ? <ServicesTab /> : null}
      {tab === "engagements" ? <EngagementsTab /> : null}
      {tab === "messages" ? <MessagesTab /> : null}
      {tab === "reports" ? <ReportsTab /> : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Services — the orderable service catalog as a responsive card grid.        */
/* -------------------------------------------------------------------------- */

function ServicesTab() {
  const statusBar = (
    <ContentStatusBar
      left={<span>{AUDIT_SERVICES.length} services</span>}
      right={<span>Delivered by the Afframe audit team</span>}
    />
  )

  return (
    <ContentPanel statusBar={statusBar}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Paid add-on services delivered by Afframe&apos;s independent audit
          team. Order a service, then choose which of your companies it covers
          on the Engagements tab.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIT_SERVICES.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </div>
    </ContentPanel>
  )
}

function ServiceCard({ service }: { service: AuditService }) {
  const icons = useIcons()
  const Icon = icons[service.icon]

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
            <Icon className="size-5" />
          </span>
          {service.popular ? <Badge variant="secondary">Popular</Badge> : null}
        </div>
        <CardTitle className="mt-3">{service.name}</CardTitle>
        <CardDescription>{service.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="font-heading text-lg font-semibold tabular-nums">
          {service.price}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={() => toast(`Ordered ${service.name} — coming soon`)}
        >
          <icons.Plus />
          Order
        </Button>
      </CardFooter>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Engagements — companies enrolled in a service, as a plain table.     */
/* -------------------------------------------------------------------------- */

function EngagementsTab() {
  const icons = useIcons()

  const toolbar = (
    <ContentToolbar
      left={
        <span className="text-xs text-muted-foreground">
          Choose which companies each service covers.
        </span>
      }
      right={
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast("New engagement — coming soon")}
        >
          <icons.Plus />
          New engagement
        </Button>
      }
    />
  )

  const statusBar = (
    <ContentStatusBar
      left={<span>{AUDIT_ENGAGEMENTS.length} engagements</span>}
    />
  )

  return (
    <ContentPanel toolbar={toolbar} statusBar={statusBar}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Company</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {AUDIT_ENGAGEMENTS.map((engagement) => (
            <EngagementRow key={engagement.id} engagement={engagement} />
          ))}
        </TableBody>
      </Table>
    </ContentPanel>
  )
}

function EngagementRow({ engagement }: { engagement: AuditEngagement }) {
  const icons = useIcons()
  const meta = AUDIT_STATUS_META[engagement.status]

  return (
    <TableRow>
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
        <Badge variant={meta.badgeVariant}>{engagement.status}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{engagement.period}</TableCell>
      <TableCell className="text-right tabular-nums">
        {engagement.price}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => toast(`Manage ${engagement.company} — coming soon`)}
        >
          Manage
        </Button>
      </TableCell>
    </TableRow>
  )
}

/* -------------------------------------------------------------------------- */
/* Messages — the thread with the Afframe audit team + a stub composer.        */
/* -------------------------------------------------------------------------- */

function MessagesTab() {
  const icons = useIcons()

  const statusBar = (
    <ContentStatusBar
      left={<span>Communicate with the Afframe audit team</span>}
      right={<span>{AUDIT_MESSAGES.length} messages</span>}
    />
  )

  return (
    <ContentPanel statusBar={statusBar}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-3">
          {AUDIT_MESSAGES.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </div>
        <form
          className="flex items-center gap-2 border-t border-border-subtle pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            toast("Send message — coming soon")
          }}
        >
          <Input placeholder="Message the Afframe audit team…" disabled />
          <Button
            type="submit"
            onClick={() => toast("Send message — coming soon")}
          >
            <icons.Send />
            Send
          </Button>
        </form>
      </div>
    </ContentPanel>
  )
}

function MessageRow({ message }: { message: AuditMessage }) {
  const mine = message.from === "You"
  return (
    <div className={cn("flex flex-col gap-1", mine && "items-end")}>
      <div className="px-1 text-xs text-muted-foreground">
        {message.author} · {formatDate(message.date)}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 text-sm",
          mine
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {message.body}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Reports — delivered documents + archive, as a plain table.                  */
/* -------------------------------------------------------------------------- */

function ReportsTab() {
  const icons = useIcons()
  const [showArchived, setShowArchived] = React.useState(false)

  const shown = showArchived
    ? AUDIT_REPORTS
    : AUDIT_REPORTS.filter((r) => !r.archived)
  const archivedCount = AUDIT_REPORTS.filter((r) => r.archived).length

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
    <ContentPanel toolbar={toolbar} statusBar={statusBar}>
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
            <ReportRow key={report.id} report={report} />
          ))}
        </TableBody>
      </Table>
    </ContentPanel>
  )
}

function ReportRow({ report }: { report: AuditReport }) {
  const icons = useIcons()
  const meta = AUDIT_REPORT_KIND_META[report.kind]

  return (
    <TableRow className={cn(report.archived && "text-muted-foreground")}>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          <icons.FileText className="size-4 text-muted-foreground" />
          {report.title}
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
          onClick={() => toast(`Download ${report.title} — coming soon`)}
        >
          <icons.Download />
          Download
        </Button>
      </TableCell>
    </TableRow>
  )
}
