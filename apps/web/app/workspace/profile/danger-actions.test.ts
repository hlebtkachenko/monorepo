import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { withAdminBypass } from "@workspace/db"
import {
  admin_staff_role,
  app_user,
  auth_account,
  auth_session,
  auth_token,
  auth_verification,
  organization,
  organization_membership,
  workspace,
  workspace_membership,
} from "@workspace/db/schema"

import { createDangerOtpValue } from "./danger-otp"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  deleteCookie: vi.fn(),
}))

vi.mock("@workspace/auth/server", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
    },
  },
}))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
      set: vi.fn(),
      delete: mocks.deleteCookie,
    }),
}))

describe("profile account deletion", () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.signOut.mockReset().mockResolvedValue(undefined)
    mocks.deleteCookie.mockReset()
  })

  it("consumes the OTP, revokes access, removes auth data, and anonymizes PII", async () => {
    const userId = randomUUID()
    const accountId = randomUUID()
    const sessionId = randomUUID()
    const impersonationSessionId = randomUUID()
    const impersonationTargetId = randomUUID()
    const tokenId = randomUUID()
    const verificationId = randomUUID()
    const email = `delete-${userId}@example.com`
    const code = "123456"
    const identifier = `app:profile-danger:delete_account:${userId}`

    await withAdminBypass(async (db) => {
      await db.insert(app_user).values({
        id: userId,
        email,
        name: "Delete Me",
        role: "admin",
        display_name: "Delete Me",
        phone: "+420123456789",
        given_name: "Delete",
        family_name: "Me",
        signature_data: '["M0 0L1 1"]',
      })
      await db.insert(app_user).values({
        id: impersonationTargetId,
        email: `impersonated-${impersonationTargetId}@example.com`,
        name: "Impersonation target",
      })
      await db.insert(admin_staff_role).values({
        user_id: userId,
        role: "admin",
      })
      await db.insert(auth_account).values({
        id: accountId,
        user_id: userId,
        account_id: userId,
        provider_id: "credential",
        password: "not-a-real-hash",
      })
      await db.insert(auth_session).values({
        id: sessionId,
        user_id: userId,
        token: `session-${userId}`,
        expires_at: new Date(Date.now() + 60_000),
      })
      await db.insert(auth_session).values({
        id: impersonationSessionId,
        user_id: impersonationTargetId,
        impersonated_by: userId,
        token: `impersonation-${userId}`,
        expires_at: new Date(Date.now() + 60_000),
      })
      await db.insert(auth_token).values({
        id: tokenId,
        token_hash: `token-${userId}`,
        kind: "sig",
        env: "dev",
        payload: { email },
        expires_at: new Date(Date.now() + 60_000),
        issued_to_user_id: userId,
      })
      await db.insert(auth_verification).values({
        id: verificationId,
        identifier,
        value: createDangerOtpValue(
          process.env.BETTER_AUTH_SECRET!,
          identifier,
          code,
        ),
        expires_at: new Date(Date.now() + 60_000),
      })
    })

    mocks.getSession.mockResolvedValue({
      session: { id: sessionId, userId, updatedAt: new Date() },
      user: { id: userId, email, name: "Delete Me" },
    })

    const { confirmDeleteAccountAction } = await import("./danger-actions")
    await expect(
      confirmDeleteAccountAction("WRONG PHRASE", code),
    ).resolves.toEqual({
      ok: false,
      errorKey: "confirmationPhraseInvalid",
    })

    await expect(
      confirmDeleteAccountAction("DELETE MY ACCOUNT", code),
    ).resolves.toEqual({
      ok: true,
    })

    const result = await withAdminBypass(async (db) => {
      const [user] = await db
        .select()
        .from(app_user)
        .where(eq(app_user.id, userId))
        .limit(1)
      const accounts = await db
        .select()
        .from(auth_account)
        .where(eq(auth_account.user_id, userId))
      const sessions = await db
        .select()
        .from(auth_session)
        .where(eq(auth_session.user_id, userId))
      const tokens = await db
        .select()
        .from(auth_token)
        .where(eq(auth_token.issued_to_user_id, userId))
      const verifications = await db
        .select()
        .from(auth_verification)
        .where(eq(auth_verification.identifier, identifier))
      const staffRoles = await db
        .select()
        .from(admin_staff_role)
        .where(eq(admin_staff_role.user_id, userId))
      const impersonationSessions = await db
        .select()
        .from(auth_session)
        .where(eq(auth_session.id, impersonationSessionId))
      return {
        user,
        accounts,
        sessions,
        tokens,
        verifications,
        staffRoles,
        impersonationSessions,
      }
    })

    expect(result.user).toMatchObject({
      email: `deleted+${userId}@deleted.invalid`,
      name: "Deleted user",
      display_name: "Deleted user",
      phone: null,
      given_name: null,
      family_name: null,
      signature_data: null,
      role: "user",
      banned: true,
    })
    expect(result.user?.deleted_at).toBeInstanceOf(Date)
    expect(result.accounts).toHaveLength(0)
    expect(result.sessions).toHaveLength(0)
    expect(result.tokens).toHaveLength(0)
    expect(result.verifications).toHaveLength(0)
    expect(result.staffRoles).toHaveLength(0)
    expect(result.impersonationSessions).toHaveLength(0)

    await expect(
      confirmDeleteAccountAction("DELETE MY ACCOUNT", code),
    ).resolves.toEqual({ ok: false, errorKey: "otpInvalid" })
  })

  it("leaves the active workspace and unassigns company responsibility", async () => {
    const userId = randomUUID()
    const ownerId = randomUUID()
    const workspaceId = randomUUID()
    const organizationId = randomUUID()
    const membershipId = randomUUID()
    const ownerMembershipId = randomUUID()
    const verificationId = randomUUID()
    const email = `leave-${userId}@example.com`
    const code = "654321"
    const identifier = `app:profile-danger:leave_workspace:${userId}`

    await withAdminBypass(async (db) => {
      await db.insert(app_user).values([
        { id: userId, email, name: "Leaving Member" },
        {
          id: ownerId,
          email: `owner-${ownerId}@example.com`,
          name: "Workspace Owner",
        },
      ])
      await db.insert(workspace).values({
        id: workspaceId,
        created_by_user_id: ownerId,
        display_name: `Leave test ${workspaceId}`,
      })
      await db.insert(workspace_membership).values([
        {
          id: ownerMembershipId,
          workspace_id: workspaceId,
          user_id: ownerId,
          role: "owner",
        },
        {
          id: membershipId,
          workspace_id: workspaceId,
          user_id: userId,
          role: "member",
        },
      ])
      await db.insert(organization).values({
        id: organizationId,
        organization_id: organizationId,
        workspace_id: workspaceId,
        slug: `leave-${organizationId}`,
        legal_name: "Leave test company",
        person_kind: "legal_entity",
        legal_subject_kind: "for_profit",
        responsible_user_id: userId,
      })
      await db.insert(organization_membership).values({
        organization_id: organizationId,
        workspace_id: workspaceId,
        user_id: userId,
        workspace_membership_id: membershipId,
        role: "member",
      })
      await db.insert(auth_verification).values({
        id: verificationId,
        identifier,
        value: createDangerOtpValue(
          process.env.BETTER_AUTH_SECRET!,
          identifier,
          code,
        ),
        expires_at: new Date(Date.now() + 60_000),
      })
    })

    mocks.getSession.mockResolvedValue({
      session: { id: randomUUID(), userId, updatedAt: new Date() },
      user: { id: userId, email, name: "Leaving Member" },
    })

    const { confirmLeaveWorkspaceAction } = await import("./danger-actions")
    await expect(
      confirmLeaveWorkspaceAction("LEAVE WORKSPACE", code),
    ).resolves.toEqual({ ok: true })

    const result = await withAdminBypass(async (db) => {
      const [member] = await db
        .select({ active: workspace_membership.active })
        .from(workspace_membership)
        .where(eq(workspace_membership.id, membershipId))
      const [owner] = await db
        .select({ active: workspace_membership.active })
        .from(workspace_membership)
        .where(eq(workspace_membership.id, ownerMembershipId))
      const [organizationRow] = await db
        .select({
          responsibleUserId: organization.responsible_user_id,
        })
        .from(organization)
        .where(eq(organization.id, organizationId))
      const [organizationMember] = await db
        .select({ active: organization_membership.active })
        .from(organization_membership)
        .where(eq(organization_membership.organization_id, organizationId))
      const challenges = await db
        .select()
        .from(auth_verification)
        .where(eq(auth_verification.identifier, identifier))
      return {
        member,
        owner,
        organizationRow,
        organizationMember,
        challenges,
      }
    })

    expect(result.member?.active).toBe(false)
    expect(result.owner?.active).toBe(true)
    expect(result.organizationRow?.responsibleUserId).toBeNull()
    expect(result.organizationMember?.active).toBe(false)
    expect(result.challenges).toHaveLength(0)
    expect(mocks.deleteCookie).toHaveBeenCalled()
  })
})
