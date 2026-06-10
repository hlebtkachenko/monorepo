"use server"

import { desc } from "drizzle-orm"

import { mintToken } from "@workspace/auth/tokens"
import { issueInvite, type InviteRole } from "@workspace/auth/invite-issuer"
import { withAdminBypass } from "@workspace/db"
import { organization } from "@workspace/db/schema"

import { assertAdminCaller } from "../assert-admin-caller"

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3010"

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
  await assertAdminCaller()
  try {
    const ttlSeconds = Math.max(60, Math.round(input.ttlDays * 86400))
    const { rawToken } = await mintToken({
      kind: "sig",
      payload: {
        email: input.email.trim(),
        workspace: input.workspace.trim(),
      },
      ttlSeconds,
    })
    const url = `${WEB_BASE_URL}/auth/signup?token=${encodeURIComponent(rawToken)}`
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
  await assertAdminCaller()
  try {
    const ttlSeconds = Math.max(60, Math.round(input.ttlDays * 86400))
    const result = await issueInvite({
      email: input.email.trim(),
      organizationId: input.organizationId.trim(),
      role: input.role,
      brandName: "Afframe",
      baseUrl: WEB_BASE_URL,
      ttlSeconds,
      issuedByUserId: null,
    })
    return { ok: true, url: result.url }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface OutboxMessage {
  at: string
  to: string
  from: string
  subject: string
  text?: string
  html?: string
  url?: string
}

export async function fetchOutboxAction(): Promise<OutboxMessage[]> {
  await assertAdminCaller()
  try {
    const res = await fetch(`${WEB_BASE_URL}/api/dev/outbox`, {
      cache: "no-store",
    })
    if (!res.ok) return []
    const data = (await res.json()) as { messages?: OutboxMessage[] }
    return data.messages ?? []
  } catch {
    return []
  }
}

export interface OrgChoice {
  id: string
  slug: string
  legalName: string
}

export async function listOrganizationsAction(): Promise<OrgChoice[]> {
  await assertAdminCaller()
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
