import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"

import { getWorkspaceContext } from "../../_lib/workspace-context"
import { listOrgsForWorkspace } from "../_lib/manage-orgs"
import { buildOrgCsv } from "../_lib/org-export"

/** CSV of the workspace's organizations. No redirects (publicOrigin N/A). */
export async function GET(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return new Response("Unauthorized", { status: 401 })

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId)
    return new Response("No workspace", { status: 404 })

  const csv = buildOrgCsv(await listOrgsForWorkspace(ctx.activeWorkspaceId))
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="organizations.csv"',
    },
  })
}
