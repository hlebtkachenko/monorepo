import "server-only"

import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { audit_event } from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"
import { Text } from "@workspace/ui/components/text"

import { PageHeader } from "@/app/(gated)/_components/page-header"
import { Section } from "@/app/(gated)/_components/section"
import { JsonViewer } from "@/app/(gated)/_components/json-viewer"
import { auditAdminAction } from "@/lib/admin-audit"

export const metadata = { title: "Audit event" }

interface AuditEventRow {
  id: string
  workspace_id: string | null
  organization_id: string | null
  actor_user_id: string | null
  action: string
  payload: unknown
  created_at: Date
}

async function loadEvent(id: string): Promise<AuditEventRow | null> {
  try {
    return await withAdminBypass(async (db) => {
      const rows = await db
        .select({
          id: audit_event.id,
          workspace_id: audit_event.workspace_id,
          organization_id: audit_event.organization_id,
          actor_user_id: audit_event.actor_user_id,
          action: audit_event.action,
          payload: audit_event.payload,
          created_at: audit_event.created_at,
        })
        .from(audit_event)
        .where(eq(audit_event.id, id))
        .limit(1)
      return (rows[0] as AuditEventRow | undefined) ?? null
    })
  } catch {
    return null
  }
}

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().replace("T", " ").slice(0, 19) + "Z"
}

function KeyValue({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-40 shrink-0 text-xs text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={
          mono
            ? "font-mono text-xs break-all"
            : "text-sm break-all text-foreground"
        }
      >
        {value && value.length > 0 ? value : "—"}
      </span>
    </div>
  )
}

export default async function AuditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await loadEvent(id)
  if (!event) notFound()

  await auditAdminAction({
    action: "admin.compliance.audit_event_viewed",
    payload: { audit_event_id: id },
  })

  const payload = event.payload as Record<string, unknown> | null

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title={event.action}
        description="Audit event detail."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {event.id}
            </Badge>
            <Text variant="muted" className="text-xs">
              {fmt(event.created_at)}
            </Text>
          </div>
        }
      />
      <Section title="Event">
        <div className="flex flex-col">
          <KeyValue label="ID" value={event.id} mono />
          <KeyValue label="Action" value={event.action} mono />
          <KeyValue label="Created at" value={fmt(event.created_at)} />
          <KeyValue label="Actor user ID" value={event.actor_user_id} mono />
          <KeyValue label="Workspace ID" value={event.workspace_id} mono />
          <KeyValue
            label="Organization ID"
            value={event.organization_id}
            mono
          />
        </div>
      </Section>
      <Section title="Payload">
        <JsonViewer value={payload ?? {}} collapsedDepth={3} title="payload" />
      </Section>
    </div>
  )
}
