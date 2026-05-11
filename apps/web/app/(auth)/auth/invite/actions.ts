"use server"

import { cookies, headers } from "next/headers"
import { eq, and } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { verifyInviteToken, TokenError } from "@workspace/auth/tokens"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
  workspace_membership,
} from "@workspace/db/schema"

const INVITE_TOKEN_COOKIE = "app-invite-token"

export interface InviteResult {
  ok: boolean
  error?: string
  /** Slug of the organization the user just joined; used for redirect. */
  orgSlug?: string
}

/**
 * Accept the invite for the user already signed in. Caller must ensure the
 * session user's email matches the invite token email.
 */
export async function acceptInviteAction(): Promise<InviteResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(INVITE_TOKEN_COOKIE)?.value
  if (!token) {
    return { ok: false, error: "Invite session expired." }
  }

  let claims
  try {
    claims = await verifyInviteToken(token)
  } catch (err) {
    cookieStore.delete(INVITE_TOKEN_COOKIE)
    return {
      ok: false,
      error:
        err instanceof TokenError
          ? `Invite token ${err.code.toLowerCase()}.`
          : "Invalid invite token.",
    }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return { ok: false, error: "Sign in first." }
  }
  if (session.user.email.toLowerCase() !== claims.email.toLowerCase()) {
    return {
      ok: false,
      error: "This invite is for a different email address.",
    }
  }

  try {
    const slug = await materializeInvite({
      organizationId: claims.organizationId,
      role: claims.role,
      userId: session.user.id,
    })
    cookieStore.delete(INVITE_TOKEN_COOKIE)
    return { ok: true, orgSlug: slug }
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Could not accept invitation.",
    }
  }
}

/**
 * New-user accept path. Creates the Better Auth account, then materializes
 * the invite (workspace + organization membership), then signs in.
 */
export async function completeInviteSignupAction(input: {
  name: string
  password: string
}): Promise<InviteResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(INVITE_TOKEN_COOKIE)?.value
  if (!token) {
    return { ok: false, error: "Invite session expired. Start over." }
  }
  let claims
  try {
    claims = await verifyInviteToken(token)
  } catch (err) {
    cookieStore.delete(INVITE_TOKEN_COOKIE)
    return {
      ok: false,
      error:
        err instanceof TokenError
          ? `Invite token ${err.code.toLowerCase()}.`
          : "Invalid invite token.",
    }
  }

  if (input.password.length < 12) {
    return { ok: false, error: "Password must be at least 12 characters." }
  }
  const trimmedName = input.name.trim()
  if (trimmedName.length < 2) {
    return { ok: false, error: "Enter your full name." }
  }

  let userId: string
  try {
    const signUp = await auth.api.signUpEmail({
      body: {
        email: claims.email,
        password: input.password,
        name: trimmedName,
      },
    })
    userId = signUp.user.id
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Could not create account.",
    }
  }

  let slug: string
  try {
    slug = await materializeInvite({
      organizationId: claims.organizationId,
      role: claims.role,
      userId,
    })
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Could not accept invitation.",
    }
  }

  try {
    await auth.api.signInEmail({
      body: { email: claims.email, password: input.password },
      headers: await headers(),
    })
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Account created, but sign-in failed.",
    }
  }

  cookieStore.delete(INVITE_TOKEN_COOKIE)
  return { ok: true, orgSlug: slug }
}

/**
 * Create (or reuse) workspace_membership + organization_membership for a
 * user joining the organization identified by `organizationId`.
 *
 * Runs under withAdminBypass: at this moment we hold no tenancy context
 * (the user has no session GUC for app.organization_id), and RLS would
 * otherwise hide rows or reject INSERTs.
 *
 * Returns the organization slug so the caller can redirect to `/<slug>`.
 */
async function materializeInvite(input: {
  organizationId: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
  userId: string
}): Promise<string> {
  return await withAdminBypass(async (db) => {
    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    if (!org) {
      throw new Error("Organization not found for invite.")
    }
    const [user] = await db
      .select({ id: app_user.id })
      .from(app_user)
      .where(eq(app_user.id, input.userId))
      .limit(1)
    if (!user) {
      throw new Error("User row missing after signup.")
    }

    // Ensure a workspace_membership exists (active). Re-use any active row.
    const [existingWsM] = await db
      .select({ id: workspace_membership.id })
      .from(workspace_membership)
      .where(
        and(
          eq(workspace_membership.workspace_id, org.workspace_id),
          eq(workspace_membership.user_id, input.userId),
          eq(workspace_membership.active, true),
        ),
      )
      .limit(1)

    let wsMembershipId: string
    if (existingWsM) {
      wsMembershipId = existingWsM.id
    } else {
      const [inserted] = await db
        .insert(workspace_membership)
        .values({
          workspace_id: org.workspace_id,
          user_id: input.userId,
          role: "member",
        })
        .returning()
      if (!inserted) {
        throw new Error("Could not create workspace membership.")
      }
      wsMembershipId = inserted.id
    }

    // Create organization_membership. The partial unique index on
    // (organization_id, user_id) WHERE active = true blocks duplicates.
    await db.insert(organization_membership).values({
      organization_id: org.id,
      workspace_id: org.workspace_id,
      user_id: input.userId,
      workspace_membership_id: wsMembershipId,
      role: input.role,
    })

    return org.slug
  })
}
