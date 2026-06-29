import "server-only"

import { Badge } from "@workspace/ui/components/badge"
import { Text } from "@workspace/ui/components/text"

import { DataTable, type ColumnDef } from "@/app/(gated)/_components"
import { PageHeader } from "@/app/(gated)/_components/page-header"
import { Section } from "@/app/(gated)/_components/section"
import { auditAdminAction } from "@/lib/admin-audit"

import { DOMAINS } from "../_data/domains"

export const metadata = { title: "TLS certificates" }
export const dynamic = "force-dynamic"

interface CertProbe {
  host: string
  status: "valid" | "expiring" | "expired" | "unknown"
  notAfter: Date | null
  daysRemaining: number | null
  detail: string
}

async function probeCert(host: string): Promise<CertProbe> {
  // Live cert fetch via tls.connect is blocked under Vercel/Fargate sandboxing
  // — admin's runtime can't open raw TLS sockets here. Until we wire the
  // Cloudflare API for cert metadata, return an "unknown" probe row so the
  // page renders the inventory + the "not yet wired" banner. This avoids
  // shipping fake "90 days remaining" data that looks authoritative.
  return {
    host,
    status: "unknown",
    notAfter: null,
    daysRemaining: null,
    detail: "Live probe not wired (Cloudflare API pending)",
  }
}

const TONE = {
  valid: "secondary",
  expiring: "outline",
  expired: "destructive",
  unknown: "outline",
} as const

const COLUMNS: ColumnDef[] = [
  {
    key: "host",
    label: "Host",
    render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (v) => (
      <Badge variant={TONE[v as CertProbe["status"]]}>{String(v)}</Badge>
    ),
  },
  {
    key: "notAfter",
    label: "Not after",
    render: (v) => (
      <span className="text-muted-foreground">
        {v instanceof Date ? v.toISOString().slice(0, 10) : "—"}
      </span>
    ),
  },
  {
    key: "daysRemaining",
    label: "Days remaining",
    render: (v) => (
      <span className="text-muted-foreground">
        {v === null || v === undefined ? "—" : String(v)}
      </span>
    ),
  },
  {
    key: "detail",
    label: "Detail",
    render: (v) => (
      <span className="text-xs text-muted-foreground">{String(v)}</span>
    ),
  },
]

export default async function TlsPage() {
  const probes = await Promise.all(
    DOMAINS.filter((d) => d.role !== "zone").map((d) => probeCert(d.host)),
  )

  const expired = probes.filter((p) => p.status === "expired").length
  const expiring = probes.filter((p) => p.status === "expiring").length

  await auditAdminAction({
    action: "admin.platform.tls_viewed",
    payload: { total: probes.length, expired, expiring },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="TLS certificates"
        description="Days-remaining tracker for every public Afframe certificate. Cloudflare manages issuance via Universal SSL; this view rolls them up so an expiring cert can't sneak past us."
        meta={
          <Text variant="small" className="text-muted-foreground">
            {probes.length} certificates · {expired} expired · {expiring}{" "}
            expiring within 30 days
          </Text>
        }
      />

      <Section
        title="Live cert probe is not wired yet"
        description="The admin task can't open raw TLS sockets in the production sandbox. Cloudflare API integration is the next milestone — for now this view shows the inventory only."
      >
        <DataTable
          columns={COLUMNS}
          rows={probes as unknown as Array<Record<string, unknown>>}
        />
      </Section>
    </div>
  )
}
