import "server-only"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@workspace/auth/server"

import { auditAdminAction } from "./admin-audit"
import {
  lookupStepUp,
  type StepUpActionKey,
  type StepUpLevel,
} from "./capabilities"
import { safeNextPath } from "./safe-next-path"
import {
  signStepUpToken,
  verifyStepUpToken,
  type StepUpPayload,
} from "./step-up-token"

const COOKIE_NAME = "admin_step_up"
const MAX_AGE_MS = 5 * 60 * 1000

function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET missing or too short for step-up HMAC")
  }
  return secret
}

/**
 * Write the signed step-up cookie. HttpOnly + Secure + SameSite=Strict. The
 * payload binds to BOTH the current session id (defeats cross-session
 * replay) and a 5-minute expiry (defeats long-lived cookie theft).
 */
export async function setStepUpCookie(level: StepUpLevel): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("step-up requires an active session")

  const payload: StepUpPayload = {
    user_id: session.user.id,
    session_id: session.session.id,
    level,
    exp: Date.now() + MAX_AGE_MS,
  }
  const token = signStepUpToken(payload, getSecret())

  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(MAX_AGE_MS / 1000),
  })

  await auditAdminAction({
    action: "auth.admin.step_up_granted",
    payload: { level },
  })
}

/**
 * Clear the step-up cookie. Called on sign-out so a stale cookie can't be
 * paired with a new session by chance. (Session-id binding already rejects
 * cross-session replay; this is belt-and-braces.)
 */
export async function clearStepUpCookie(): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  })
}

/**
 * Read + validate the step-up cookie against the current session. Returns
 * the payload only when signature, session binding, expiry, and required
 * level all check out. Returns null otherwise.
 *
 * `twofa` token satisfies a `password` requirement (twofa subsumes password
 * freshness).
 */
async function readFreshStepUp(
  required: StepUpLevel,
): Promise<StepUpPayload | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return null

  const payload = verifyStepUpToken(raw, getSecret())
  if (!payload) return null

  if (payload.user_id !== session.user.id) return null
  if (payload.session_id !== session.session.id) return null
  if (payload.exp < Date.now()) return null
  if (required === "twofa" && payload.level !== "twofa") return null

  return payload
}

/**
 * Layouts + server actions call this BEFORE running sensitive work. On
 * miss, redirects to the step-up page with `return` + `level`. On match,
 * returns silently.
 *
 * `returnPath` defaults to `"/"` for action callers that don't track their
 * own URL; pages should pass their pathname so the user lands back where
 * they were.
 */
export async function requireStepUp(
  level: StepUpLevel,
  returnPath = "/",
): Promise<void> {
  const fresh = await readFreshStepUp(level)
  if (fresh) return
  redirect(
    `/auth/step-up?level=${encodeURIComponent(level)}&return=${encodeURIComponent(safeNextPath(returnPath))}`,
  )
}

/**
 * Convenience for action call sites that map a named action key to a
 * step-up level via `STEP_UP`. The `StepUpActionKey` union catches typos
 * at compile time — a misspelled key would have silently no-op'd.
 */
export async function requireStepUpForAction(
  actionKey: StepUpActionKey,
  returnPath = "/",
): Promise<void> {
  const level = lookupStepUp(actionKey)
  if (level) await requireStepUp(level, returnPath)
}
