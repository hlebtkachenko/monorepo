"use server"

import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import {
  isActiveMember,
  writePendingReference,
} from "@workspace/auth/oauth-tenant-binding"

/**
 * Persist the organization the signed-in user chose for the in-flight OAuth
 * authorize request. The org id comes from the client, so it is authorized
 * server-side against a live active membership before it is stored; a
 * non-member id is rejected and never written. `consentReferenceId`
 * re-validates the stored choice again at token-mint time.
 */
export async function selectOrganizationAction(
  organizationId: string,
): Promise<{ ok: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) return { ok: false }
  if (!(await isActiveMember(userId, organizationId))) return { ok: false }
  await writePendingReference(userId, organizationId)
  return { ok: true }
}
