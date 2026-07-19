import { cookies } from "next/headers"
import { readAuthCookie } from "@workspace/auth/tokens"
import type { InviteRecord, InviteRole } from "@workspace/auth/invite-issuer"

/**
 * Invite-token cookie reader.
 *
 * Mirrors the signup-cookie pattern (ADR-0022 §"Kind taxonomy"):
 *
 *   __Host-afkey-inv  — raw opaque token, set by /auth/invite/consume.
 *                       The corresponding auth_token row stays 'pending'
 *                       until `materializeInvite` atomically consumes it
 *                       at accept time.
 *   app-invite-payload — JSON-encoded InviteRecord (minus expiresAt) so
 *                       downstream reads (welcome card, role detector)
 *                       don't need a DB round-trip.
 */

const INVITE_PAYLOAD_COOKIE = "app-invite-payload"

interface PersistedInvitePayload {
  kind: "invite"
  id: string
  email: string
  organizationId: string
  workspaceId: string
  role: InviteRole
}

export async function readInviteClaims(): Promise<InviteRecord | null> {
  const cookieStore = await cookies()

  // Gate on the opaque auth cookie. If it isn't set, treat the payload
  // as absent — a stale payload-only cookie must not resurrect an
  // expired/revoked invite.
  const rawAfkey = readAuthCookie(cookieStore, "inv")
  if (!rawAfkey) return null

  const payloadRaw = cookieStore.get(INVITE_PAYLOAD_COOKIE)?.value
  if (!payloadRaw) return null

  let parsed: PersistedInvitePayload | null = null
  try {
    const obj = JSON.parse(payloadRaw) as unknown
    if (
      obj !== null &&
      typeof obj === "object" &&
      "kind" in obj &&
      (obj as Record<string, unknown>).kind === "invite" &&
      typeof (obj as Record<string, unknown>).id === "string" &&
      typeof (obj as Record<string, unknown>).email === "string" &&
      typeof (obj as Record<string, unknown>).organizationId === "string" &&
      typeof (obj as Record<string, unknown>).workspaceId === "string" &&
      typeof (obj as Record<string, unknown>).role === "string"
    ) {
      parsed = obj as PersistedInvitePayload
    }
  } catch {
    return null
  }
  if (!parsed) return null

  // expiresAt is not persisted in the cookie — the welcome card doesn't
  // need it; the underlying auth_token row's expires_at is the source of
  // truth and is consulted again by consumeToken at accept time.
  return {
    id: parsed.id,
    email: parsed.email,
    organizationId: parsed.organizationId,
    workspaceId: parsed.workspaceId,
    role: parsed.role,
    status: "pending",
    expiresAt: new Date(0),
  }
}

/** Returns the raw token without a DB lookup — used by accept actions. */
export async function readRawInviteToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return readAuthCookie(cookieStore, "inv")
}

export async function clearInviteCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_PAYLOAD_COOKIE, path: "/" })
  cookieStore.delete({ name: "__Host-afkey-inv", path: "/" })
}
