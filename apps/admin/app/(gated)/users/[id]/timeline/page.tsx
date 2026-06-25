import "server-only"

import { notFound } from "next/navigation"
import Link from "next/link"
import { desc, eq, or, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { app_user, audit_event } from "@workspace/db/schema"

import { EmptyState } from "@/app/(gated)/_components"
import { auditAdminAction } from "@/lib/admin-audit"

export const metadata = { title: "User timeline" }

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

    const where = or(
      eq(audit_event.actor_user_id, id),
      eq(sql`${audit_event.payload}->>'user_id'`, id),
    )

    const [countRow, events] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(audit_event)
        .where(where),
      db
        .select()
        .from(audit_event)
        .where(where)
        .orderBy(desc(audit_event.created_at))
        .limit(PAGE_SIZE)
        .offset(pageIndex * PAGE_SIZE),
    ])

    return { user, totalRows: countRow[0]?.count ?? 0, events }
  })

  if (!data) notFound()

  const { user, totalRows, events } = data

  await auditAdminAction({
    action: "admin.user.timeline_viewed",
    payload: { user_id: id },
  })

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6 p-6">

      {events.length === 0 ? (
        <EmptyState
          title="No events"
          description="No audit events found for this user."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Actor</th>
                <th className="px-3 py-2 text-left font-medium">Payload</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-border hover:bg-muted/30"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {e.created_at.toISOString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-3 py-2">
                    {e.actor_user_id ? (
                      <Link
                        href={`/users/${e.actor_user_id}`}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {e.actor_user_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <span
                      className="block max-w-sm truncate"
                      title={JSON.stringify(e.payload)}
                    >
                      {JSON.stringify(e.payload)}
                    </span>
                  </td>
                </tr>
              ))}
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
                href={`/users/${id}/timeline?page=${pageIndex - 1}`}
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
                href={`/users/${id}/timeline?page=${pageIndex + 1}`}
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
