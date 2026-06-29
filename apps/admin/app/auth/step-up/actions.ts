"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"

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

  // Better Auth's verifyPassword returns `{ status: true }` on match and
  // throws `APIError("INVALID_PASSWORD")` otherwise — the catch is the
  // real check.
  try {
    await auth.api.verifyPassword({
      body: { password: input.password },
      headers: h,
    })
  } catch {
    return await recordFailure(session.session.id, "wrong_password")
  }

  // SECURITY: whether TOTP is required is a SERVER-derived fact — the
  // operator's 2FA enrollment (app_user.two_factor_enabled), read here under
  // admin bypass — NOT anything in the request body. A 2FA-enrolled operator
  // must always clear TOTP to step up; a forged/absent code can only fail the
  // check, never skip it. The cookie certifies the level actually proven and
  // is re-validated against each resource's `STEP_UP` requirement downstream.
  const twoFactorEnrolled = await withAdminBypass(async (db) => {
    const [u] = await db
      .select({ enabled: app_user.two_factor_enabled })
      .from(app_user)
      .where(eq(app_user.id, session.user.id))
      .limit(1)
    return u?.enabled ?? false
  })

  let provedLevel: StepUpLevel = "password"
  if (twoFactorEnrolled) {
    try {
      await auth.api.verifyTOTP({
        body: { code: input.code ?? "" },
        headers: h,
      })
    } catch {
      return await recordFailure(session.session.id, "wrong_totp")
    }
    provedLevel = "twofa"
  }

  clearAttempts(session.session.id)
  await setStepUpCookie(provedLevel)
  redirect(safeNextPath(input.next))
}

async function recordFailure(
  sessionId: string,
  reason: "wrong_password" | "wrong_totp",
): Promise<StepUpResult> {
  const rl = recordAttempt(sessionId)
  await auditAdminAction({
    action: "auth.admin.step_up_failed",
    payload: { reason, remaining: rl.remaining },
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
