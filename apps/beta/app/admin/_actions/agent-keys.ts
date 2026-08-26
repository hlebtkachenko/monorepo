"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { issueAgentKey, revokeAgentKey } from "@/lib/data/office/agent-keys"
import { requireOffice } from "@/lib/data/scope"
import { BETA_OFFICE_ISSUE_RATE_LIMIT } from "@/lib/auth/policy"
import { officeIssueRateLimiter } from "@/lib/auth/rate-limit"
import { rateLimitKey } from "@/lib/auth/request-ip"

import { formString, formUuid } from "./input"
import type { AdminActionState } from "./state"

/**
 * Agentní klíče — the two writes of the registry (spec §3.2).
 *
 * `requireOffice()` first, exactly as every other /admin action does, and the
 * SAME issuance rate limiter the setup links use: minting credentials is the act
 * a stolen office session would want to perform at machine speed, and an agent
 * key is the longer-lived of the two.
 *
 * THE SECRET GOES INTO THE RETURN VALUE AND NOWHERE ELSE. Not into a log line,
 * not into the redirect, not into the database (only `sha256` is). See
 * `state.ts` and `issued-key.tsx`.
 *
 * ISSUANCE ITSELF REMAINS HLEB'S GATE (campaign gate 2). This surface is the
 * mechanism; nothing here mints a key for real use without a human pressing the
 * button in /admin.
 */
export async function issueAgentKeyAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()
  const requestHeaders = await headers()

  const verdict = officeIssueRateLimiter(
    rateLimitKey(requestHeaders, "office-issue"),
    BETA_OFFICE_ISSUE_RATE_LIMIT,
  )
  if (!verdict.allowed) {
    return { status: "error", error: "admin.errorTooManyRequests" }
  }

  const label = formString(formData, "label")
  // An empty organization field is the office-global scope, deliberately
  // expressed as "no book chosen" rather than as a magic value: a malformed uuid
  // is a refusal, never a silent widening to every book.
  const rawOrganization = formString(formData, "organizationId")
  const organizationId =
    rawOrganization === "" ? null : formUuid(formData, "organizationId")
  if (rawOrganization !== "" && organizationId === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await issueAgentKey(office, { label, organizationId })
  if (!result.ok) {
    return {
      status: "error",
      error:
        result.reason === "invalid_label"
          ? "admin.errorAgentKeyLabelRequired"
          : result.reason === "organization_archived"
            ? "admin.errorOrganizationArchived"
            : "admin.errorRejected",
    }
  }

  revalidatePath("/admin/agentni-klice")
  return {
    status: "issuedKey",
    secret: result.key.secret,
    label: result.key.label,
  }
}

export async function revokeAgentKeyAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const keyId = formUuid(formData, "keyId")
  if (keyId === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const { revoked } = await revokeAgentKey(office, keyId)

  revalidatePath("/admin/agentni-klice")
  return revoked
    ? { status: "ok", message: "admin.okAgentKeyRevoked" }
    : { status: "error", error: "admin.errorNothingToRevoke" }
}
