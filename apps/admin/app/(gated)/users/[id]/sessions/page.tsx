import "server-only"

import { notFound } from "next/navigation"
import Link from "next/link"
import { desc, eq, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { app_user, auth_session } from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { EmptyState } from "@/app/(gated)/_components"
import { auditAdminAction } from "@/lib/admin-audit"

import { RevokeUserSessionButton } from "./_components/revoke-user-session-button"

export const metadata = { title: "User sessions" }

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}

const PAGE_SIZE = 50

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params
  const { page: pageParam } = await searchParams
  const pageIndex = Math.max(0, Number(pageParam ?? 0))

  const data = await withAdminBypass(async (db) => {
    const [user] = await db
      .select({ id: app_user.id, email: app_user.email })
      .from(app_user)
      .where(eq(app_user.id, id))
      .limit(1)

    if (!user) return null

    const [countRow, sessions] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auth_session)
        .where(eq(auth_session.user_id, id)),
      db
        .select()
        .from(auth_session)
        .where(eq(auth_session.user_id, id))
        .orderBy(desc(auth_session.created_at))
        .limit(PAGE_SIZE)
        .offset(pageIndex * PAGE_SIZE),
    ])

    return { user, totalRows: countRow[0]?.count ?? 0, sessions }
  })

  if (!data) notFound()

  const { user, totalRows, sessions } = data

  await auditAdminAction({
    action: "admin.user.sessions_viewed",
    payload: { user_id: id },
  })

  const now = new Date()
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6 p-6">

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions"
          description="This user has no session records."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">IP Address</th>
                <th className="px-3 py-2 text-left font-medium">User Agent</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
                <th className="px-3 py-2 text-left font-medium">Expires</th>
                <th className="px-3 py-2 text-left font-medium">Active</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const active = s.expires_at > now
                return (
                  <tr
                    key={s.id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.ip_address ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.user_agent ? (
                        <span
                          className="block max-w-xs truncate"
                          title={s.user_agent}
                        >
                          {s.user_agent.slice(0, 60)}
                          {s.user_agent.length > 60 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.created_at.toISOString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.expires_at.toISOString()}
                    </td>
                    <td className="px-3 py-2">
                      {active ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="outline">Expired</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <RevokeUserSessionButton
                        sessionId={s.id}
                        userId={user.id}
                        userEmail={user.email}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {pageIndex + 1} of {totalPages} ({totalRows} total)
          </span>
          <div className="flex items-center gap-2">
            {pageIndex > 0 ? (
              <Link
                href={`/users/${id}/sessions?page=${pageIndex - 1}`}
                className="rounded border border-border px-2 py-1 hover:bg-muted"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded border border-border px-2 py-1 opacity-40">
                Previous
              </span>
            )}
            {pageIndex + 1 < totalPages ? (
              <Link
                href={`/users/${id}/sessions?page=${pageIndex + 1}`}
                className="rounded border border-border px-2 py-1 hover:bg-muted"
              >
                Next
              </Link>
            ) : (
              <span className="rounded border border-border px-2 py-1 opacity-40">
                Next
              </span>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  )
}
