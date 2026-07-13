"use client"

import * as React from "react"
import Link from "next/link"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
} from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  actionRequiredEngagements,
  AUDIT_ENGAGEMENTS,
  AUDIT_MESSAGES,
  computeAuditKpis,
  formatDate,
  type AuditEngagement,
} from "./data"

/**
 * Audit → Overview. The landing page of the Audit module: a KPI row of
 * `Card size="sm"` tiles, an "Action required" list (the awaiting-docs
 * engagements, each linking to Engagements), and a quick-actions row. All MOCK,
 * all deterministic. The content-header title is "Overview" (the sidebar module
 * h2 already says "Audit"); there is no body `<h1>`.
 */
export function AuditOverview() {
  const kpis = React.useMemo(
    () => computeAuditKpis(AUDIT_ENGAGEMENTS, AUDIT_MESSAGES),
    [],
  )
  const actionItems = React.useMemo(
    () => actionRequiredEngagements(AUDIT_ENGAGEMENTS),
    [],
  )

  const statusBar = (
    <ContentStatusBar
      left={<span>{AUDIT_ENGAGEMENTS.length} engagements tracked</span>}
      right={<span>Delivered by the Afframe audit team</span>}
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Overview" />
      </AppPageHeader>
      <ContentPanel statusBar={statusBar}>
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <KpiRow kpis={kpis} />
          <ActionRequired items={actionItems} />
          <QuickActions />
        </div>
      </ContentPanel>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* KPI row                                                                     */
/* -------------------------------------------------------------------------- */

function KpiRow({ kpis }: { kpis: ReturnType<typeof computeAuditKpis> }) {
  const tiles: {
    icon: IconName
    label: string
    value: string
    hint: string
    emphasize?: boolean
  }[] = [
    {
      icon: "BriefcaseBusiness",
      label: "Active engagements",
      value: String(kpis.active),
      hint: "In progress",
    },
    {
      icon: "ListChecksIcon",
      label: "Action required",
      value: String(kpis.actionRequired),
      hint: "Awaiting your docs",
      emphasize: kpis.actionRequired > 0,
    },
    {
      icon: "MessageSquare",
      label: "Unread messages",
      value: String(kpis.unreadMessages),
      hint: "From the audit team",
    },
    {
      icon: "Send",
      label: "Next delivery",
      value: kpis.nextDeliveryEta ? formatDate(kpis.nextDeliveryEta) : "—",
      hint: "Soonest report due",
    },
  ]

  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        {tiles.map((tile) => (
          <KpiTile key={tile.label} {...tile} />
        ))}
      </div>
    </div>
  )
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  emphasize,
}: {
  icon: IconName
  label: string
  value: string
  hint: string
  emphasize?: boolean
}) {
  const icons = useIcons()
  const Icon = icons[icon]
  return (
    <Card size="sm" className="gap-2">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" />
          {label}
        </CardDescription>
        <CardTitle className="font-heading text-2xl tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span
          className={
            emphasize
              ? "text-xs font-medium text-primary"
              : "text-xs text-muted-foreground"
          }
        >
          {hint}
        </span>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Action required                                                             */
/* -------------------------------------------------------------------------- */

function ActionRequired({ items }: { items: AuditEngagement[] }) {
  const icons = useIcons()

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-sm font-medium">Action required</h2>
        {items.length > 0 ? (
          <Badge variant="secondary">{items.length}</Badge>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-card p-4 text-sm text-muted-foreground">
          <icons.CheckCircle2 className="size-4" />
          Nothing needs your attention right now.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Button
                asChild
                variant="outline"
                className="h-auto w-full justify-between px-4 py-3"
              >
                <Link href="/workspace/audit/engagements">
                  <span className="flex min-w-0 items-center gap-3">
                    <icons.Building2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-col items-start gap-0.5">
                      <span className="truncate font-medium">
                        {item.company}
                      </span>
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {item.service} · {item.period}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge variant="secondary">Awaiting docs</Badge>
                    <icons.ChevronRight className="size-4 text-muted-foreground" />
                  </span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Quick actions                                                               */
/* -------------------------------------------------------------------------- */

function QuickActions() {
  const icons = useIcons()
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-medium">Quick actions</h2>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/workspace/audit/services">
            <icons.Plus />
            Order a service
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/workspace/audit/messages">
            <icons.MessageSquare />
            Message the team
          </Link>
        </Button>
      </div>
    </section>
  )
}
