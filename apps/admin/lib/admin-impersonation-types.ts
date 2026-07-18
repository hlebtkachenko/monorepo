import "server-only"

/**
 * Pure-type module split out of `admin-impersonation.ts` because that file
 * is marked `"use server"` — Next.js forbids non-async-function exports
 * from a `"use server"` module.
 */
export interface ImpersonationState {
  id: string
  actorUserId: string
  targetUserId: string
  targetEmail: string
  reason: string
  startedAt: Date
  expectedEndAt: Date
  endedAt: Date | null
}

export interface StartImpersonationInput {
  targetUserId: string
  reason: string
  /**
   * When set, the impersonation is scoped to this org (the "Sign in to this
   * org" flow). It is stamped onto `impersonation.organization_id` and gated by
   * a PRECONDITION: the org must have an active support-access consent grant
   * (`organization.support_access_expires_at > now()`), else the start is
   * refused. Absent for the plain user-level impersonation flow.
   */
  organizationId?: string
}

export interface ImpersonationMutationResult {
  ok: boolean
  error?: string
}
