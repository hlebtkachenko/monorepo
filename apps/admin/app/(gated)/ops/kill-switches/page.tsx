import "server-only"

import { asc } from "drizzle-orm"

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
import { KILL_SWITCH_FLAG_PREFIXES, isKillSwitchFlag } from "@/lib/capabilities"

import { KillSwitchToggle } from "./_components/kill-switch-toggle"

export const metadata = { title: "Kill switches" }
export const dynamic = "force-dynamic"

interface FlagRow {
  key: string
  enabled: boolean
  description: string
  updated_at: Date | string
}

async function loadKillSwitches(): Promise<FlagRow[]> {
  const rows = await withAdminBypass((db) =>
    db
      .select({
        key: feature_flag.key,
        enabled: feature_flag.enabled,
        description: feature_flag.description,
        updated_at: feature_flag.updated_at,
      })
      .from(feature_flag)
      .orderBy(asc(feature_flag.key)),
  )
  return rows.filter((r) => isKillSwitchFlag(r.key))
}

function fmt(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().replace("T", " ").slice(0, 19) + "Z"
}

export default async function KillSwitchesPage() {
  const flags = await loadKillSwitches()
  const enabledCount = flags.filter((f) => f.enabled).length

  await auditAdminAction({
    action: "admin.ops.kill_switches_viewed",
    payload: { total: flags.length, enabled: enabledCount },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Kill switches"
        description="Emergency flags that disable a feature, force maintenance, or block a payment provider. Flipping any of these requires fresh two-factor and writes an audit row."
        meta={
          <div className="flex items-center gap-3">
            <Badge variant={enabledCount > 0 ? "destructive" : "secondary"}>
              {enabledCount} active
            </Badge>
            <Text variant="small" className="text-muted-foreground">
              Prefix scanner:{" "}
              {KILL_SWITCH_FLAG_PREFIXES.map((p) => (
                <span
                  key={p}
                  className="ml-1 rounded bg-muted px-1 font-mono text-xs"
                >
                  {p}
                </span>
              ))}
            </Text>
          </div>
        }
      />

      {flags.length === 0 ? (
        <Section>
          <Card>
            <CardContent className="py-12 text-center">
              <Text variant="muted">
                No kill switches registered. Add a flag with a key starting in
                one of the scanner prefixes (e.g.{" "}
                <code className="font-mono">maintenance.lockdown</code>) to
                surface it here.
              </Text>
            </CardContent>
          </Card>
        </Section>
      ) : (
        <Section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {flags.map((f) => (
              <Card
                key={f.key}
                className={f.enabled ? "border-destructive/40" : ""}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <CardTitle className="font-mono text-sm">
                        {f.key}
                      </CardTitle>
                      <Text variant="muted" className="text-sm">
                        {f.description}
                      </Text>
                    </div>
                    <Badge
                      variant={f.enabled ? "destructive" : "outline"}
                      className="shrink-0"
                    >
                      {f.enabled ? "ACTIVE" : "inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <Text
                      variant="small"
                      className="text-xs text-muted-foreground"
                    >
                      Last flipped: {fmt(f.updated_at)}
                    </Text>
                    <KillSwitchToggle
                      flagKey={f.key}
                      enabled={f.enabled}
                      returnPath="/ops/kill-switches"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
