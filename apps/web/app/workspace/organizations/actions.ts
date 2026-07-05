"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@workspace/auth/server"

import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "../_lib/workspace-context"
import { setOrgArchived } from "./_lib/manage-orgs"

export interface ArchiveResult {
  ok: boolean
  errorKey?: string
}

async function archive(
  orgId: string,
  archived: boolean,
): Promise<ArchiveResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) return { ok: false, errorKey: "sessionExpired" }

  // Resolve the active workspace server-side; the client never supplies it. The
  // explicit workspace_id predicate in setOrgArchived is the tenant fence.
  const ctx = await getWorkspaceContext(userId)
  if (!ctx.activeWorkspaceId)
    return { ok: false, errorKey: "noActiveWorkspace" }

  // Archiving/restoring a book is consequential office-level administration:
  // owner/admin only (a plain member cannot), matching the org settings gate.
  const roleError = requireWorkspaceRole(ctx, ["owner", "admin"])
  if (roleError) return roleError

  const done = await setOrgArchived(ctx.activeWorkspaceId, orgId, archived)
  if (!done) return { ok: false, errorKey: "notFound" }

  revalidatePath("/workspace/organizations")
  revalidatePath("/workspace")
  return { ok: true }
}

export async function archiveOrgAction(orgId: string): Promise<ArchiveResult> {
  return archive(orgId, true)
}

export async function unarchiveOrgAction(
  orgId: string,
): Promise<ArchiveResult> {
  return archive(orgId, false)
}
