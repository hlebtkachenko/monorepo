import "server-only"

import { headers } from "next/headers"

import type { BetaOrgRole, BetaSetupTokenPurpose } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"
import { BETA_OFFICE_ISSUE_RATE_LIMIT } from "@/lib/auth/policy"
import { officeIssueRateLimiter } from "@/lib/auth/rate-limit"
import { clientIp, clientUserAgent, rateLimitKey } from "@/lib/auth/request-ip"
import {
  issueSetupToken,
  setupLinkUrl,
  type IssueSetupTokenRejection,
} from "@/lib/auth/setup-token"
import type { OfficeScope } from "@/lib/data/scope"

import type { AdminActionState } from "./state"

/**
 * The one path from an /admin form to a one-time link.
 *
 * Three actions mint links — create a user, invite into an organization, reset
 * a password — and all three come through here, so the rate limit, the
 * forensics and the once-only display cannot be implemented three ways.
 *
 * WHY /admin IS RATE LIMITED AT ALL. It sits behind `requireOffice()`, so this
 * is not an anti-guessing budget: it is a blast-radius cap on a STOLEN office
 * session, which could otherwise mint owner grants into every book in the
 * database at machine speed and leave a registry the thief can also read. The
 * key is the office user's client IP, with the shared-bucket fallback every
 * other limiter in this app uses (`rateLimitKey`), so a request that somehow
 * arrives without one is still counted rather than waved through.
 *
 * THE RAW LINK GOES INTO THE RETURN VALUE AND NOWHERE ELSE. Not into a log line
 * ("issued link X for Y" is a credential in a log aggregator), not into a
 * redirect, not into the database. See `state.ts`.
 */
export async function issueLinkAction(input: {
  office: OfficeScope
  purpose: BetaSetupTokenPurpose
  email: string
  organizationId: string | null
  grantedRole: BetaOrgRole | null
}): Promise<AdminActionState> {
  const requestHeaders = await headers()

  const verdict = officeIssueRateLimiter(
    rateLimitKey(requestHeaders, "office-issue"),
    BETA_OFFICE_ISSUE_RATE_LIMIT,
  )
  if (!verdict.allowed) {
    return { status: "error", error: "admin.errorTooManyRequests" }
  }

  const result = await issueSetupToken({
    purpose: input.purpose,
    email: input.email,
    organizationId: input.organizationId,
    grantedRole: input.grantedRole,
    issuer: { kind: "office", userId: input.office.userId },
    ip: clientIp(requestHeaders),
    userAgent: clientUserAgent(requestHeaders),
  })

  if (!result.ok) {
    return { status: "error", error: issueErrorKey(result.reason) }
  }

  return {
    status: "issued",
    url: setupLinkUrl(result.link),
    email: result.link.email,
    expiresAt: result.link.expiresAt.toISOString(),
  }
}

function issueErrorKey(reason: IssueSetupTokenRejection): BetaMessageKey {
  switch (reason) {
    case "invalid_email":
      return "admin.errorInvalidEmail"
    case "role_not_allowed":
      return "admin.errorRoleNotAllowed"
    case "organization_archived":
      return "admin.errorOrganizationArchived"
    case "purpose_not_allowed":
    case "scope_mismatch":
      return "admin.errorInvalidInput"
    case "rejected":
      return "admin.errorRejected"
  }
}
