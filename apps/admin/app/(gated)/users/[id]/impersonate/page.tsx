import "server-only"

import { notFound } from "next/navigation"
import Link from "next/link"
import { desc, eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { app_user, impersonation } from "@workspace/db/schema"

import { EmptyState, Section } from "@/app/(gated)/_components"
import { auditAdminAction } from "@/lib/admin-audit"

import { StartImpersonationForm } from "./_components/start-impersonation-form"

export const metadata = { title: "Impersonate user" }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params

  const data = await withAdminBypass(async (db) => {
    const [user] = await db
      .select({ id: app_user.id, email: app_user.email })
      .from(app_user)
      .where(eq(app_user.id, id))
      .limit(1)

    if (!user) return null

    const sessions = await db
      .select({
        id: impersonation.id,
        started_at: impersonation.started_at,
        ended_at: impersonation.ended_at,
        actor_user_id: impersonation.actor_user_id,
        reason: impersonation.reason,
      })
      .from(impersonation)
      .where(eq(impersonation.target_user_id, id))
      .orderBy(desc(impersonation.started_at))
      .limit(100)

    return { user, sessions }
  })

  if (!data) notFound()

  const { user, sessions } = data

  await auditAdminAction({
    action: "admin.user.impersonate_viewed",
    payload: { user_id: id },
  })

  return (
    <div className="flex flex-col gap-6 p-6">

      <Section title="Past impersonation sessions">
        {sessions.length === 0 ? (
          <EmptyState
            title="No impersonation sessions"
            description="No admin has impersonated this user yet."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    Started at
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Ended at</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Actor user ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.started_at.toISOString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.ended_at ? (
                        s.ended_at.toISOString()
                      ) : (
                        <span className="text-muted-foreground">Active</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/users/${s.actor_user_id}`}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {s.actor_user_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Start impersonation">
        <StartImpersonationForm
          targetUserId={user.id}
          targetEmail={user.email}
        />
      </Section>
    </div>
  )
}
