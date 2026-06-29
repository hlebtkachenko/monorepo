import { sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Text } from "@workspace/ui/components/text"

import { PageHeader } from "@/app/(gated)/_components/page-header"
import { Section } from "@/app/(gated)/_components/section"
import { auditAdminAction } from "@/lib/admin-audit"

export const metadata = { title: "Health" }

interface DbHealth {
  reachable: boolean
  version: string | null
  error: string | null
}

async function probeDb(): Promise<DbHealth> {
  try {
    return await withAdminBypass(async (db) => {
      await db.execute(sql`SELECT 1`)
      const rows = (await db.execute<{ version: string }>(
        sql`SELECT version() AS version`,
      )) as unknown as Array<{ version: string }>
      return {
        reachable: true,
        version: rows[0]?.version ?? null,
        error: null,
      }
    })
  } catch (err) {
    return {
      reachable: false,
      version: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export default async function OpsHealthPage() {
  const db = await probeDb()
  await auditAdminAction({ action: "admin.ops.health_viewed" })

  const apiBase = process.env.API_BASE_URL ?? "http://localhost:3001"
  const apiHealthUrl = `${apiBase.replace(/\/$/, "")}/healthz`

  const envChecks: Array<{ name: string; ok: boolean; value: string }> = [
    {
      name: "DATABASE_URL",
      ok: Boolean(process.env.DATABASE_URL),
      value: process.env.DATABASE_URL ? "set" : "missing",
    },
    {
      name: "NODE_ENV",
      ok: typeof process.env.NODE_ENV === "string",
      value: process.env.NODE_ENV ?? "(unset)",
    },
  ]

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title="Health"
        breadcrumb="Ops"
        description="DB reachability, Postgres version, environment, downstream services."
      />
      <Section title="Database">
        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-center gap-2">
            {db.reachable ? (
              <Badge variant="secondary">DB reachable</Badge>
            ) : (
              <Badge variant="destructive">DB unreachable</Badge>
            )}
            <Text variant="muted" className="text-xs">
              SELECT 1 under withAdminBypass
            </Text>
          </div>
          {db.version ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground uppercase">
                Postgres version
              </span>
              <span className="font-mono text-xs break-all">{db.version}</span>
            </div>
          ) : null}
          {db.error ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground uppercase">
                Error
              </span>
              <span className="font-mono text-xs break-all text-destructive">
                {db.error}
              </span>
            </div>
          ) : null}
        </div>
      </Section>
      <Section title="Environment">
        <ul className="flex flex-col gap-1 rounded-md border border-border p-4">
          {envChecks.map((c) => (
            <li
              key={c.name}
              className="flex items-center justify-between border-b border-border py-1 last:border-b-0"
            >
              <span className="font-mono text-xs">{c.name}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {c.value}
                </span>
                {c.ok ? (
                  <Badge variant="secondary">ok</Badge>
                ) : (
                  <Badge variant="destructive">missing</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Downstream">
        <div className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
          <Text variant="muted" className="text-xs">
            Public API health endpoint
          </Text>
          <a
            href={apiHealthUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs hover:underline"
          >
            {apiHealthUrl}
          </a>
        </div>
      </Section>
    </div>
  )
}
