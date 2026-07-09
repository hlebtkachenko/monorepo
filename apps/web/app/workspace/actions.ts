"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@workspace/auth/server"

import { canAssignCompanies, setCompanyAssignee } from "./_lib/assign-company"
import { getWorkspaceContext } from "./_lib/workspace-context"

export interface AssignCompanyResult {
  ok: boolean
  errorKey?: string
}

/**
 * (Re)assign, or clear (`userId: null`), the responsible accountant for the
 * company `orgSlug` in the caller's active workspace. Gated to workspace
 * owner/admin — a plain member cannot reassign a book, matching the
 * archive/restore gate in `organizations/actions.ts`. The org and target user
 * are both resolved server-side against the caller's own workspace; neither
 * `organization_id` nor `workspace_id` is ever accepted as client input.
 */
export async function setCompanyAssigneeAction(
  orgSlug: string,
  userId: string | null,
): Promise<AssignCompanyResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  const sessionUserId = session?.user?.id
  if (!sessionUserId) return { ok: false, errorKey: "sessionExpired" }

  const ctx = await getWorkspaceContext(sessionUserId)
  if (!ctx.activeWorkspaceId)
    return { ok: false, errorKey: "noActiveWorkspace" }
  if (!ctx.current || !canAssignCompanies(ctx.current.role))
    return { ok: false, errorKey: "forbidden" }

  const result = await setCompanyAssignee(
    ctx.activeWorkspaceId,
    orgSlug,
    userId,
  )
  if (!result.ok) return { ok: false, errorKey: result.errorKey }

  revalidatePath("/workspace")
  revalidatePath("/workspace/legislation")
  return { ok: true }
}
