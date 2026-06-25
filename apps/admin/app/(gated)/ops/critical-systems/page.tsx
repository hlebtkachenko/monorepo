import { sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Text } from "@workspace/ui/components/text"

import { PageHeader } from "@/app/(gated)/_components/page-header"
import { Section } from "@/app/(gated)/_components/section"
import { auditAdminAction } from "@/lib/admin-audit"

export const metadata = { title: "Critical systems" }
export const dynamic = "force-dynamic"

type Status = "up" | "degraded" | "down" | "unknown"

interface SystemProbe {
  name: string
  description: string
  status: Status
  detail: string
}

async function probeDatabase(): Promise<SystemProbe> {
  try {
    const t0 = Date.now()
    await withAdminBypass((db) => db.execute(sql`SELECT 1`))
    const ms = Date.now() - t0
    return {
      name: "PostgreSQL",
      description: "Primary database (app_dev / RLS-bound)",
      status: ms > 500 ? "degraded" : "up",
      detail: `${ms}ms SELECT 1`,
    }
  } catch (err) {
    return {
      name: "PostgreSQL",
      description: "Primary database (app_dev / RLS-bound)",
      status: "down",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function probeHttp(
  name: string,
  description: string,
  url: string,
): Promise<SystemProbe> {
  if (!url) {
    return {
      name,
      description,
      status: "unknown",
      detail: "URL not configured",
    }
  }
  try {
    const t0 = Date.now()
    const r = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    })
    const ms = Date.now() - t0
    if (!r.ok) {
      return {
        name,
        description,
        status: "down",
        detail: `HTTP ${r.status} (${ms}ms)`,
      }
    }
    return {
      name,
      description,
      status: ms > 1000 ? "degraded" : "up",
      detail: `HTTP ${r.status} (${ms}ms)`,
    }
  } catch (err) {
    return {
      name,
      description,
      status: "down",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

function envProbe(name: string, description: string, key: string): SystemProbe {
  const present = Boolean(process.env[key])
  return {
    name,
    description,
    status: present ? "up" : "unknown",
    detail: present ? "configured" : `${key} not set`,
  }
}

const STATUS_TONE: Record<Status, "secondary" | "outline" | "destructive"> = {
  up: "secondary",
  degraded: "outline",
  down: "destructive",
  unknown: "outline",
}

const STATUS_LABEL: Record<Status, string> = {
  up: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
}

function summarize(probes: SystemProbe[]): {
  worst: Status
  counts: Record<Status, number>
} {
  const counts: Record<Status, number> = {
    up: 0,
    degraded: 0,
    down: 0,
    unknown: 0,
  }
  for (const p of probes) counts[p.status]++
  const worst: Status =
    counts.down > 0
      ? "down"
      : counts.degraded > 0
        ? "degraded"
        : counts.unknown > 0
          ? "unknown"
          : "up"
  return { worst, counts }
}

export default async function CriticalSystemsPage() {
  const apiBase = process.env.API_BASE_URL ?? ""
  const webBase = process.env.WEB_BASE_URL ?? ""

  const [db, api, web] = await Promise.all([
    probeDatabase(),
    probeHttp(
      "Public API",
      "REST + OpenAPI surface (apps/api)",
      apiBase ? `${apiBase.replace(/\/$/, "")}/healthz` : "",
    ),
    probeHttp(
      "Web app",
      "Customer-facing Next.js app (apps/web)",
      webBase ? `${webBase.replace(/\/$/, "")}/api/health` : "",
    ),
  ])

  const probes: SystemProbe[] = [
    db,
    api,
    web,
    envProbe(
      "Auth secret",
      "Better Auth HMAC key + admin step-up signing key",
      "BETTER_AUTH_SECRET",
    ),
    envProbe(
      "OpenFGA",
      "Authorization sidecar — relationship checks",
      "OPENFGA_API_URL",
    ),
    envProbe(
      "Cerbos",
      "Policy engine sidecar — action gates",
      "CERBOS_API_URL",
    ),
    envProbe("Resend", "Outbound email transport", "RESEND_API_KEY"),
  ]

  const { worst, counts } = summarize(probes)
  await auditAdminAction({
    action: "admin.ops.critical_systems_viewed",
    payload: { worst, counts },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Critical systems"
        description="Traffic-light overview of every dependency the admin surface owns. Run this first when something feels off."
        meta={
          <div className="flex items-center gap-3">
            <Badge variant={STATUS_TONE[worst]}>
              Overall: {STATUS_LABEL[worst]}
            </Badge>
            <Text variant="small" className="text-muted-foreground">
              {counts.up} up · {counts.degraded} degraded · {counts.down} down ·{" "}
              {counts.unknown} unknown
            </Text>
          </div>
        }
      />

      <Section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {probes.map((p) => (
            <Card key={p.name}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <Badge variant={STATUS_TONE[p.status]}>
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </div>
                <Text variant="muted" className="text-sm">
                  {p.description}
                </Text>
              </CardHeader>
              <CardContent>
                <Text
                  variant="small"
                  className="font-mono text-xs text-muted-foreground"
                >
                  {p.detail}
                </Text>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  )
}
