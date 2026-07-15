import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import { getWorkspaceContext } from "../_lib/workspace-context"
import { DocumentsDebug } from "./documents-debug"

export const metadata = { title: "Documents debug" }

/**
 * DEV-ONLY harness for the S3 document store. Exercises the full flow —
 * upload → confirm → preview → download → soft-delete → undo — against the
 * real `/api/documents/*` routes via the generic `documents-client` functions.
 *
 * This is a throwaway test surface, NOT the product UI: the storage capability
 * lives in reusable client functions (`app/_lib/documents-client.ts`) so the
 * real Inbox / attachment surfaces can wire it wherever a document appears.
 * Any production build returns 404. Reachable at `/workspace/debug-documents`,
 * hidden from nav (allow-listed in scripts/check-nav.ts).
 */
export default async function DebugDocumentsPage() {
  if (process.env.NODE_ENV === "production") notFound()

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")
  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  return <DocumentsDebug workspaceName={ctx.current?.name ?? "workspace"} />
}
