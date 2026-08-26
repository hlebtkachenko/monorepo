"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import type { BetaMessageKey } from "@/i18n/messages"
import { BETA_ORG_INVITE_RATE_LIMIT } from "@/lib/auth/policy"
import { orgInviteRateLimiter } from "@/lib/auth/rate-limit"
import { clientIp, clientUserAgent, rateLimitKey } from "@/lib/auth/request-ip"
import { setupLinkUrl } from "@/lib/auth/setup-token"
import {
  inviteEmployeeSeat,
  type EmployeeSeatInviteRejection,
} from "@/lib/data/employee-seat"
import { requireScope } from "@/lib/data/scope"

import type { MzdyActionState } from "./state"

/**
 * Mzdy › Zaměstnanci' one write: hand an employee their own portal seat (spec
 * §2.6.1, §2.10 "employee-seat invites from Mzdy").
 *
 * `requireScope(orgSlug)` IS THE FIRST STATEMENT, and the slug comes from the
 * form rather than from a closure — `nastaveni/_actions/people.ts` states the
 * full argument: a Server Action is a POST endpoint with a generated name, it
 * does not inherit its page's gate and it never re-enters the layout that
 * rendered the form, so `mzdy/layout.tsx`'s `payrollScope` check protects
 * nothing here. The tenancy resolution (and the forced-TOTP mandate folded into
 * it) happens from scratch on every call.
 *
 * THE CEILING IS NOT IN THIS FILE. `lib/data/employee-seat.ts` holds the three
 * gates and `lib/auth/invite-policy.ts` holds the matrix underneath them; this
 * function reads a form, calls one function and translates the answer into a
 * Czech sentence.
 *
 * IT SHARES `orgInviteRateLimiter` WITH LIDÉ, on purpose. Both mint an
 * `org_invite` — the same credential, the same 72h TTL, the same email-shaped
 * output — so a separate bucket would be a second budget for one act, and an
 * attacker who has an admin session would simply alternate between the two forms
 * to double their rate. One key ("org-invite"), one budget.
 */
export async function inviteEmployeeSeatAction(
  _previous: MzdyActionState,
  formData: FormData,
): Promise<MzdyActionState> {
  const scope = await requireScope(formString(formData, "orgSlug"))

  const employeeId = formUuid(formData, "employeeId")
  if (employeeId === null) {
    return { status: "error", error: "mzdy.errorInvalidInput" }
  }

  const requestHeaders = await headers()
  const verdict = orgInviteRateLimiter(
    rateLimitKey(requestHeaders, "org-invite"),
    BETA_ORG_INVITE_RATE_LIMIT,
  )
  if (!verdict.allowed) {
    return { status: "error", error: "mzdy.errorTooManyRequests" }
  }

  const result = await inviteEmployeeSeat(scope, {
    employeeId,
    email: formString(formData, "email"),
    ip: clientIp(requestHeaders),
    userAgent: clientUserAgent(requestHeaders),
  })

  if (!result.ok) {
    return { status: "error", error: inviteErrorKey(result.reason) }
  }

  revalidatePath(`/${scope.organizationSlug}/mzdy/zamestnanci`)
  return {
    status: "issued",
    url: setupLinkUrl(result.link),
    email: result.link.email,
    expiresAt: result.link.expiresAt.toISOString(),
  }
}

/**
 * Reading the two fields this boundary accepts.
 *
 * Duplicated from `nastaveni/_actions/input.ts` for the reason that file states
 * about ITS duplication from `admin/_actions/input.ts`: each write boundary
 * declares which fields it reads, and a shared "form input" module is how one
 * surface ends up accepting a field the other never meant to offer.
 */
function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Postgres answers a non-uuid `= $1` against a uuid column with 22P02, which
 * reaches the browser as a 500. A malformed id has to be an ordinary refusal.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formUuid(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return UUID.test(value) ? value : null
}

function inviteErrorKey(reason: EmployeeSeatInviteRejection): BetaMessageKey {
  if (typeof reason === "object") {
    // `issueSetupToken`'s own refusals. Only `invalid_email` says anything
    // actionable to a company admin filling in an address; the rest are
    // structural refusals this form cannot produce (it never chooses a purpose,
    // a role or an organization) or database guards saying no, and both become
    // the generic answer rather than naming a constraint.
    return reason.issue === "invalid_email"
      ? "mzdy.errorInvalidEmail"
      : "mzdy.errorRejected"
  }
  switch (reason) {
    case "not_allowed":
      return "mzdy.errorNotAllowed"
    case "unknown_employee":
      return "mzdy.errorUnknownEmployee"
    case "already_linked":
      return "mzdy.errorAlreadyLinked"
  }
}
