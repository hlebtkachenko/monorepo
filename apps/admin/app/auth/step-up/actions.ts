"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@workspace/auth/server"

import { auditAdminAction } from "@/lib/admin-audit"
import { safeNextPath } from "@/lib/safe-next-path"
import { setStepUpCookie } from "@/lib/step-up"
import { clearAttempts, recordAttempt } from "@/lib/step-up-rate-limit"
import type { StepUpLevel } from "@/lib/capabilities"

export interface StepUpResult {
  ok: boolean
  error?: string
}

export interface StepUpInput {
  password: string
  code?: string
  level: StepUpLevel
  /** Sanitized server-side; client value is hint-only. */
  next: string
}

/**
 * Verify password (and TOTP when level=twofa) for the current session,
 * then mint a fresh step-up cookie. The user's session is NOT mutated —
 * Better Auth's `verifyPassword` + `verifyTOTP` endpoints are pure checks.
 * On success we `redirect(next)` so the caller lands where they were.
 *
 * Rate limit (`step-up-rate-limit`) counts FAILED attempts only — a
 * correctly-entered password+TOTP doesn't consume the budget. Window is
 * 5 attempts / 5 min keyed by session id; legitimate users typing a
 * wrong code can still recover.
 */
export async function verifyStepUpAction(
  input: StepUpInput,
): Promise<StepUpResult> {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session) {
    return { ok: false, error: "Session expired. Sign in again." }
  }

  if (!input.password || input.password.length === 0) {
    return { ok: false, error: "Password required" }
  }
  if (input.level === "twofa" && (!input.code || input.code.length < 6)) {
    return { ok: false, error: "Two-factor code required" }
  }

  // Better Auth's verifyPassword returns `{ status: true }` on match and
  // throws `APIError("INVALID_PASSWORD")` otherwise — the catch is the
  // real check.
  try {
    await auth.api.verifyPassword({
      body: { password: input.password },
      headers: h,
    })
  } catch {
    return await recordFailure(
      session.session.id,
      "wrong_password",
      input.level,
    )
  }

  if (input.level === "twofa") {
    try {
      await auth.api.verifyTOTP({
        body: { code: input.code! },
        headers: h,
      })
    } catch {
      return await recordFailure(session.session.id, "wrong_totp", input.level)
    }
  }

  clearAttempts(session.session.id)
  await setStepUpCookie(input.level)
  redirect(safeNextPath(input.next))
}

async function recordFailure(
  sessionId: string,
  reason: "wrong_password" | "wrong_totp",
  level: StepUpLevel,
): Promise<StepUpResult> {
  const rl = recordAttempt(sessionId)
  await auditAdminAction({
    action: "auth.admin.step_up_failed",
    payload: { reason, level, remaining: rl.remaining },
  })
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${rl.retryInSec}s.`,
    }
  }
  return {
    ok: false,
    error:
      reason === "wrong_password" ? "Wrong password" : "Wrong two-factor code",
  }
}
