import Link from "next/link"
import { sql } from "drizzle-orm"
import {
  ArrowUpRight,
  Building2,
  FlaskConical,
  Globe,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  audit_event,
  feature_flag,
  organization,
  workspace,
} from "@workspace/db/schema"
import { Text } from "@workspace/ui/components/text"
import { cn } from "@workspace/ui/lib/utils"

export const metadata = { title: "Home" }

async function loadHomeData() {
  return withAdminBypass(async (db) => {
    const [orgCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organization)
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(app_user)
    const [workspaceCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspace)
    const [flagCount] = await db
      .select({
        count: sql<number>`count(*) FILTER (WHERE enabled = true)::int`,
      })
      .from(feature_flag)
    const [audit24h] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(audit_event)
      .where(sql`created_at > now() - interval '24 hours'`)
    const recent = await db
      .select({
        id: audit_event.id,
        action: audit_event.action,
        actor_user_id: audit_event.actor_user_id,
        organization_id: audit_event.organization_id,
        created_at: audit_event.created_at,
      })
      .from(audit_event)
      .orderBy(sql`${audit_event.created_at} desc`)
      .limit(12)
    return {
      orgs: orgCount?.count ?? 0,
      users: userCount?.count ?? 0,
      workspaces: workspaceCount?.count ?? 0,
      flagsEnabled: flagCount?.count ?? 0,
      audit24h: audit24h?.count ?? 0,
      recent,
    }
  })
}

type IconType = ComponentType<SVGProps<SVGSVGElement>>

const QUICK_LINKS: Array<{
  href: string
  label: string
  description: string
  icon: IconType
}> = [
  {
    href: "/orgs",
    label: "Organizations",
    description: "Tenant directory, per-org case history.",
    icon: Building2,
  },
  {
    href: "/users",
    label: "Users",
    description: "Identity, sessions, MFA, impersonation.",
    icon: Users,
  },
  {
    href: "/compliance/audit",
    label: "Audit log",
    description: "Every privileged action, who and when.",
    icon: ScrollText,
  },
  {
    href: "/ops/critical-systems",
    label: "Critical systems",
    description: "Live health of the load-bearing services.",
    icon: ShieldCheck,
  },
  {
    href: "/platform/domains",
    label: "Domains & TLS",
    description: "Hosts, certificates, deliverability.",
    icon: Globe,
  },
  {
    href: "/ops/kill-switches",
    label: "Kill switches",
    description: "Flip the emergency flags under step-up.",
    icon: FlaskConical,
  },
]

function timeAgo(d: Date | string | null): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  const diff = Date.now() - t.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s / 60) + "m ago"
  if (s < 86400) return Math.floor(s / 3600) + "h ago"
  return Math.floor(s / 86400) + "d ago"
}

const KPIS: Array<{ key: string; label: string }> = [
  { key: "orgs", label: "Organizations" },
  { key: "users", label: "Users" },
  { key: "workspaces", label: "Workspaces" },
  { key: "flagsEnabled", label: "Flags enabled" },
  { key: "audit24h", label: "Audit events · 24h" },
]

export default async function AdminHomePage() {
  let data
  try {
    data = await loadHomeData()
  } catch {
    data = {
      orgs: 0,
      users: 0,
      workspaces: 0,
      flagsEnabled: 0,
      audit24h: 0,
      recent: [] as Array<{
        id: string
        action: string
        actor_user_id: string | null
        organization_id: string | null
        created_at: Date
      }>,
    }
  }

  const kpiValues: Record<string, number> = {
    orgs: data.orgs,
    users: data.users,
    workspaces: data.workspaces,
    flagsEnabled: data.flagsEnabled,
    audit24h: data.audit24h,
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <Text variant="muted" className="text-sm">
        Staff back-office. Press{" "}
        <kbd className="rounded border border-border-subtle bg-muted px-1.5 py-0.5 font-mono text-[11px]">
          ⌘K
        </kbd>{" "}
        to jump anywhere.
      </Text>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KPIS.map((kpi) => (
          <div
            key={kpi.key}
            className="rounded-lg border border-border-subtle bg-card p-4"
          >
            <div className="font-mono text-2xl font-semibold tabular-nums">
              {(kpiValues[kpi.key] ?? 0).toLocaleString()}
            </div>
            <div className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick access */}
        <section className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Quick access
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border border-border-subtle bg-card p-4",
                    "transition-colors hover:border-border hover:bg-muted/40",
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 font-medium">
                      {link.label}
                      <ArrowUpRight
                        className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {link.description}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        {/* Recent activity */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Recent activity
            </h2>
            <Link
              href="/compliance/audit"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="rounded-lg border border-border-subtle bg-card">
            {data.recent.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No recent activity.
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {data.recent.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center gap-2 px-3 py-2 text-xs"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
                      {event.action}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {timeAgo(event.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
