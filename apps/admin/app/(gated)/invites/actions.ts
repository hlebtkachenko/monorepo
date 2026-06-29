"use server"

import { z } from "zod"
import { desc } from "drizzle-orm"

import { mintToken } from "@workspace/auth/tokens"
import {
  issueInvite,
  revokePendingInvites,
  type InviteRole,
} from "@workspace/auth/invite-issuer"
import { withAdminBypass } from "@workspace/db"
import { organization } from "@workspace/db/schema"
import { getBrandText } from "@workspace/ui/brand-assets/server"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"
import { requireStepUpForAction } from "@/lib/step-up"

// Web host for minted signup/invite links. In prod the admin container is
// fed WEB_BASE_URL=https://<web-domain> (app-stack.ts); the localhost default
// is for local dev only. NEVER derive this from the admin host — admin lives
// on admin.afframe.com, the links must point at app.afframe.com.
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3010"

const SignupTokenInput = z.object({
  email: z.string().email(),
  workspace: z.string().min(1),
  ttlDays: z.number().int().positive().max(365),
})

const InviteTokenInput = z.object({
  email: z.string().email(),
  organizationId: z.string().uuid(),
  role: z.enum(["owner", "admin", "member"]),
  ttlDays: z.number().int().positive().max(365),
})

export interface SignupTokenResult {
  ok: boolean
  url?: string
  error?: string
}

export async function generateSignupTokenAction(input: {
  email: string
  workspace: string
  ttlDays: number
}): Promise<SignupTokenResult> {
  // Cap + step-up BEFORE the try: requireStepUpForAction throws NEXT_REDIRECT,
  // which must escape uncaught so the client navigates to /auth/step-up. If it
  // were inside the try it would be swallowed into the error result and the
  // gate would silently fail. Spawning a new workspace+owner is the high-blast
  // action — it earns a fresh re-auth; the existing-org invite below does not.
  await requireAdminCapability("admin:signup_token")
  await requireStepUpForAction("invites.signup_token", "/invites")
  try {
    const parsed = SignupTokenInput.parse(input)
    const ttlSeconds = Math.max(60, Math.round(parsed.ttlDays * 86400))
    const { rawToken } = await mintToken({
      kind: "sig",
      payload: {
        email: parsed.email.trim(),
        workspace: parsed.workspace.trim(),
      },
      ttlSeconds,
    })
    const url = `${WEB_BASE_URL}/auth/signup?token=${encodeURIComponent(rawToken)}`
    await auditAdminAction({
      action: "admin.invites.signup_token_minted",
      payload: {
        email: parsed.email,
        workspace: parsed.workspace,
        ttl_days: parsed.ttlDays,
      },
    })
    return { ok: true, url }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface InviteTokenResult {
  ok: boolean
  url?: string
  error?: string
}

export async function generateInviteTokenAction(input: {
  email: string
  organizationId: string
  role: InviteRole
  ttlDays: number
}): Promise<InviteTokenResult> {
  // Inviting into an existing org is the routine support task (the web
  // owner-side member invite has no step-up either) — capability gate only.
  await requireAdminCapability("admin:org.member.write")
  try {
    const parsed = InviteTokenInput.parse(input)
    const ttlSeconds = Math.max(60, Math.round(parsed.ttlDays * 86400))
    const { name: brandName } = await getBrandText()
    // Match the web flow's invariant: a fresh invite supersedes any pending
    // one for the same (org, email), so the older token can't be redeemed.
    await revokePendingInvites({
      organizationId: parsed.organizationId.trim(),
      email: parsed.email.trim(),
    })
    const result = await issueInvite({
      email: parsed.email.trim(),
      organizationId: parsed.organizationId.trim(),
      role: parsed.role as InviteRole,
      brandName,
      baseUrl: WEB_BASE_URL,
      ttlSeconds,
      issuedByUserId: null,
    })
    await auditAdminAction({
      action: "admin.invites.invite_token_minted",
      organizationId: parsed.organizationId,
      payload: {
        email: parsed.email,
        role: parsed.role,
        ttl_days: parsed.ttlDays,
      },
    })
    return { ok: true, url: result.url }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface OrgChoice {
  id: string
  slug: string
  legalName: string
}

export async function listOrganizationsAction(): Promise<OrgChoice[]> {
  // Matches the invite action it feeds, not the broad admin:read (which would
  // expose the org list to guest/developer/designer too — looser than the page).
  await requireAdminCapability("admin:org.member.write")
  try {
    return await withAdminBypass(async (tx) => {
      const rows = await tx
        .select({
          id: organization.id,
          slug: organization.slug,
          legalName: organization.legal_name,
        })
        .from(organization)
        .orderBy(desc(organization.created_at))
        .limit(20)
      return rows
    })
  } catch {
    return []
  }
}
