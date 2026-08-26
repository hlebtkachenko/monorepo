"use server"

import { headers } from "next/headers"

import { PasswordSchema } from "@workspace/shared/auth"

import type { BetaMessageKey } from "@/i18n/messages"
import { BETA_CONSUME_RATE_LIMIT } from "@/lib/auth/policy"
import { consumeRateLimiter } from "@/lib/auth/rate-limit"
import { clientIp, clientUserAgent, rateLimitKey } from "@/lib/auth/request-ip"
import { consumeSetupToken } from "@/lib/auth/setup-token"
import { getBetaSession } from "@/lib/auth/session"

import type { ConsumeFormState } from "./state"

/**
 * The two POST entry points for one-time links. Separate actions rather than
 * one action with a `purpose` field: which purposes a route may consume is a
 * server-side fact, and a hidden form field is client input.
 *
 * Neither action signs anyone in. It hands `status: "consumed"` back to the
 * form, which then calls Better Auth over HTTP from the browser — so the
 * session cookie is set by the same response that mints it, and the sign-in
 * still passes through Better Auth's rate limiter. (Establishing a session from
 * inside a Server Action is the path that dropped the Set-Cookie in the main
 * app; see the note on `autoSignIn` in `packages/auth/src/server.ts`.)
 *
 * Every failure returns the same key. Expired, revoked, already used, never
 * existed, wrong purpose for this route, account already set up — one message,
 * so nothing here answers "does this address have an account?".
 *
 * `allowedPurposes` is passed DOWN into the consume rather than checked on its
 * result: the gate has to run inside the claim transaction, before any side
 * effect, or a password_reset link POSTed here would complete the reset and
 * only then be rejected. See `setup-token.ts`, property 5.
 */

const INVALID: ConsumeFormState = {
  status: "error",
  error: "auth.linkInvalid",
}

export async function consumeSetupAction(
  formData: FormData,
): Promise<ConsumeFormState> {
  return consume(formData, ["account_setup", "org_invite"])
}

export async function consumeResetAction(
  formData: FormData,
): Promise<ConsumeFormState> {
  return consume(formData, ["password_reset"])
}

async function consume(
  formData: FormData,
  allowedPurposes: readonly (
    "account_setup" | "org_invite" | "password_reset"
  )[],
): Promise<ConsumeFormState> {
  const requestHeaders = await headers()

  // The consume path is a Server Action, so Better Auth's limiter never sees
  // it. This is its own budget (Advisor blocker B4-4).
  const verdict = consumeRateLimiter(
    rateLimitKey(requestHeaders, "setup-consume"),
    BETA_CONSUME_RATE_LIMIT,
  )
  if (!verdict.allowed) {
    return { status: "error", error: "auth.tooManyAttempts" }
  }

  const rawToken = asString(formData.get("token"))
  const password = asString(formData.get("password"))
  const name = asString(formData.get("name"))
  if (!rawToken) return INVALID

  // An org invite for an account that already exists takes no password — the
  // signed-in owner of that address just gains a membership. Every other path
  // sets one, and it has to clear the same bar the main product uses.
  const session = await getBetaSession()
  if (password.length > 0) {
    const parsed = PasswordSchema.safeParse(password)
    if (!parsed.success) {
      return { status: "error", error: passwordErrorKey(parsed.error.issues) }
    }
  } else if (!session) {
    return { status: "error", error: "password.length" }
  }

  const result = await consumeSetupToken({
    rawToken,
    allowedPurposes,
    password: password.length > 0 ? password : undefined,
    name: name.length > 0 ? name : undefined,
    ip: clientIp(requestHeaders),
    userAgent: clientUserAgent(requestHeaders),
    sessionUserId: session?.userId,
  })

  if (!result.ok) {
    return result.reason === "signin_required"
      ? { status: "error", error: "auth.signInRequired" }
      : INVALID
  }

  return {
    status: "consumed",
    email: result.email,
    signIn: result.passwordSet,
    redirectTo: "/",
  }
}

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * `PasswordSchema` carries i18n slugs (`password.length`, ...) as its issue
 * messages, which are exactly the keys in beta's own catalog. Anything else is
 * the literal max-length message, which has no key.
 */
function passwordErrorKey(
  issues: readonly { message: string }[],
): BetaMessageKey {
  const slug = issues.find((issue) => issue.message.startsWith("password."))
  return (slug?.message ?? "password.length") as BetaMessageKey
}
