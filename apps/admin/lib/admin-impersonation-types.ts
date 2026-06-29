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
}

export interface ImpersonationMutationResult {
  ok: boolean
  error?: string
}
