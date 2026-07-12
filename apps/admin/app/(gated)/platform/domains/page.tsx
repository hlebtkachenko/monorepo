import "server-only"

import { Badge } from "@workspace/ui/components/badge"
import { Text } from "@workspace/ui/components/text"

import { DataTable, type ColumnDef } from "@/app/(gated)/_components"
import { PageHeader } from "@/app/(gated)/_components/page-header"
import { Section } from "@/app/(gated)/_components/section"
import { auditAdminAction } from "@/lib/admin-audit"

import { DOMAINS, type DomainEntry } from "../_data/domains"

export const metadata = { title: "Domains" }
export const dynamic = "force-dynamic"

const ENV_TONE: Record<
  DomainEntry["env"],
  "destructive" | "secondary" | "outline"
> = {
  production: "destructive",
  staging: "secondary",
  shared: "outline",
}

const ROLE_LABEL: Record<DomainEntry["role"], string> = {
  zone: "Zone apex",
  web: "Web",
  api: "API",
  admin: "Admin",
  status: "Status page",
  monitoring: "Monitoring",
  cache: "Build cache",
}

const COLUMNS: ColumnDef[] = [
  {
    key: "host",
    label: "Host",
    render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
  },
  {
    key: "env",
    label: "Env",
    render: (v) => (
      <Badge variant={ENV_TONE[v as DomainEntry["env"]]}>{String(v)}</Badge>
    ),
  },
  {
    key: "role",
    label: "Role",
    render: (v) => ROLE_LABEL[v as DomainEntry["role"]],
  },
  {
    key: "servedBy",
    label: "Served by",
    render: (v) => <span className="text-muted-foreground">{String(v)}</span>,
  },
  {
    key: "behind",
    label: "Behind",
    render: (v) => <span className="text-muted-foreground">{String(v)}</span>,
  },
  {
    key: "envVar",
    label: "Env var",
    render: (v) =>
      v ? (
        <span className="font-mono text-xs text-muted-foreground">
          {String(v)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
]

export default async function DomainsPage() {
  await auditAdminAction({
    action: "admin.platform.domains_viewed",
    payload: { total: DOMAINS.length },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Domains"
        description="Public Afframe hostnames. Inventory is seeded from docs/reference/DOMAINS-AND-EMAIL.md; once Cloudflare API access lands in the admin runtime, this view will refresh live."
        meta={
          <Text variant="small" className="text-muted-foreground">
            {DOMAINS.length} hostnames · source of truth: Cloudflare DNS
          </Text>
        }
      />

      <Section>
        <DataTable
          columns={COLUMNS}
          rows={DOMAINS as unknown as Array<Record<string, unknown>>}
        />
      </Section>
    </div>
  )
}
