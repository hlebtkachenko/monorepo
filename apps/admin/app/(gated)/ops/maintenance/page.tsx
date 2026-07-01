import "server-only"

import { eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { feature_flag } from "@workspace/db/schema"
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

import { MaintenanceToggle } from "./_components/maintenance-toggle"
import { ensureMaintenanceFlag } from "./actions"

export const metadata = { title: "Maintenance mode" }
export const dynamic = "force-dynamic"

const MAINTENANCE_KEY = "maintenance.lockdown"

interface FlagState {
  enabled: boolean
  description: string
  updated_at: Date | string
}

async function loadFlag(): Promise<FlagState | null> {
  const rows = await withAdminBypass((db) =>
    db
      .select({
        enabled: feature_flag.enabled,
        description: feature_flag.description,
        updated_at: feature_flag.updated_at,
      })
      .from(feature_flag)
      .where(eq(feature_flag.key, MAINTENANCE_KEY))
      .limit(1),
  )
  return rows[0] ?? null
}

function fmt(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().replace("T", " ").slice(0, 19) + "Z"
}

export default async function MaintenancePage() {
  await ensureMaintenanceFlag()
  const flag = await loadFlag()
  const enabled = flag?.enabled ?? false

  await auditAdminAction({
    action: "admin.ops.maintenance_viewed",
    payload: { enabled },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Maintenance mode"
        description="Flips the global maintenance.lockdown flag. While ON, the web app shows a maintenance banner; the API rejects writes with 503. Reads keep working."
        meta={
          <Badge variant={enabled ? "destructive" : "secondary"}>
            {enabled ? "Maintenance ACTIVE" : "Live traffic"}
          </Badge>
        }
      />

      <Section>
        <Card className={enabled ? "border-destructive/40" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle className="font-mono text-sm">
                  {MAINTENANCE_KEY}
                </CardTitle>
                <Text variant="muted" className="text-sm">
                  {flag?.description ??
                    "Global maintenance lockdown. Toggles the customer-facing banner and short-circuits write endpoints."}
                </Text>
              </div>
              <Badge
                variant={enabled ? "destructive" : "outline"}
                className="shrink-0"
              >
                {enabled ? "ACTIVE" : "inactive"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <Text variant="small" className="text-xs text-muted-foreground">
                {flag
                  ? `Last flipped: ${fmt(flag.updated_at)}`
                  : "Flag created just now (auto-provisioned)."}
              </Text>
              <MaintenanceToggle
                enabled={enabled}
                returnPath="/ops/maintenance"
              />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Before flipping"
        description="Quick checklist for the operator on call."
      >
        <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
          <li>Post in #incidents with the reason + expected duration.</li>
          <li>Confirm the on-call rotation is aware (PagerDuty + Slack).</li>
          <li>
            If toggling ON: verify the web app banner renders within 60s (next
            request after revalidation).
          </li>
          <li>
            If toggling OFF: watch error rates for 5 minutes — incoming writes
            that queued may stampede the DB.
          </li>
        </ul>
      </Section>
    </div>
  )
}
