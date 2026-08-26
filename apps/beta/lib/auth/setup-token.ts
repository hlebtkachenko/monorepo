import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm"

import { betaDb, type BetaDatabase } from "@/db/client"
import {
  app_user,
  auth_account,
  auth_session,
  organization,
  organization_membership,
  user_setup_token,
  type BetaOrgRole,
  type BetaSetupTokenPurpose,
} from "@/db/schema"

import { betaAuth } from "./server"

/**
 * The one-time links that are the only way into the beta portal.
 *
 * Public sign-up is off (`server.ts`), so every account, every org membership
 * and every password reset arrives through a row in `user_setup_token`. The
 * table's own guarantees are in the migrations: only the sha256 of the link
 * secret is stored, the TTL is capped at 72h, the issuer is checked at INSERT
 * (0000) and the whole grant is immutable afterwards (0001). This module is the
 * consume half.
 *
 * THE FOUR PROPERTIES THIS FILE HAS TO KEEP
 *
 * 1. POST-only. Consuming is a Server Action; a GET renders the form and
 *    touches nothing. A link prefetched by a mail client, a scanner or a
 *    browser must not burn itself.
 *
 * 2. One atomic claim. The `UPDATE ... WHERE consumed_at IS NULL AND revoked_at
 *    IS NULL AND expires_at > now() RETURNING` both tests and takes the token in
 *    a single statement, so two concurrent clicks cannot both win: the second
 *    blocks on the row lock and then matches zero rows.
 *
 * 3. One uniform failure. Unknown / expired / revoked / already-consumed /
 *    precondition-failed all return the same `invalid` verdict with the same
 *    message. A caller must not be able to tell a wrong guess from a used link,
 *    or learn whether an email has an account.
 *
 * 4. The token never survives the consume. It is not written into the redirect,
 *    and `Referrer-Policy: no-referrer` (next.config.mjs) keeps the URL that
 *    carried it out of any outbound request.
 *
 * TRANSACTION SHAPE — and its one honest seam. The claim, the sibling revoke,
 * the membership write and the `consumed_user_id` stamp all run in ONE database
 * transaction. Creating the user and its credential does not: it goes through
 * Better Auth's `internalAdapter` (Advisor blocker B4-1 — `disableSignUp` also
 * blocks the server-side `signUpEmail`, and hand-writing `auth_account` rows
 * would put beta's copy of Better Auth's storage contract in this file), and
 * that adapter holds its own connection. So the sequence is: claim (transaction
 * open) → create identity (Better Auth, commits on its own) → membership +
 * stamp → commit. A crash in the middle leaves the token UNCONSUMED (the
 * transaction rolls back) and possibly an identity with no membership. That is
 * why `account_setup` treats "user exists but has no credential account" as
 * resumable instead of as a conflict: it is the exact debris this seam can
 * leave, and it is not a usable account until the link is consumed for real.
 */

export type SetupTokenView = {
  purpose: BetaSetupTokenPurpose
  email: string
  organizationName: string | null
}

export type ConsumeInput = {
  rawToken: string
  /** Required for every flow except an org invite for an existing account. */
  password?: string | undefined
  name?: string | undefined
  ip: string | null
  userAgent: string | null
  /** The signed-in user, when there is one. Only org invites care. */
  sessionUserId?: string | undefined
}

export type ConsumeResult =
  | {
      ok: true
      purpose: BetaSetupTokenPurpose
      email: string
      userId: string
      organizationId: string | null
      /** False when the flow only granted membership to an existing account. */
      passwordSet: boolean
    }
  | { ok: false; reason: "invalid" }
  /** The invite is real, but this account already exists — prove it is you. */
  | { ok: false; reason: "signin_required"; email: string }

/**
 * What the app is allowed to write into `app_user` when a setup link creates an
 * account (Advisor carry-in SF-3).
 *
 * `is_staff` is the office-staff flag that gates /admin and is the precondition
 * for holding an `owner` membership; `disabled_at` is the deactivation switch;
 * `email_verified` is an assertion only the server may make. None of the three
 * may ever be reachable from a form, so the payload is built by an explicit
 * pick rather than a spread of caller-supplied input — a spread carries
 * whatever the caller happened to put in the object.
 *
 * `email` is NOT taken from the form either: it comes from the token row, so a
 * link issued for one address cannot create an account for another.
 */
export const SETUP_USER_ALLOWED_FIELDS = Object.freeze(["email", "name"])
export const SETUP_USER_FORBIDDEN_FIELDS = Object.freeze([
  "is_staff",
  "disabled_at",
  "email_verified",
  "two_factor_enabled",
  "id",
])

export function setupUserPayload(input: { email: string; name: string }): {
  email: string
  name: string
} {
  return { email: input.email, name: input.name }
}

/** What the database stores. The raw value exists only in the link itself. */
export function hashSetupToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex")
}

/** 256 bits of CSPRNG, url-safe. Used by the issuing side (/admin, PR 08). */
export function generateSetupToken(): string {
  return randomBytes(32).toString("base64url")
}

/**
 * Read a token without touching it — this is what a GET renders from. Returns
 * null for every unusable state, so the page cannot distinguish expired from
 * unknown either.
 */
export async function peekSetupToken(
  rawToken: string,
): Promise<SetupTokenView | null> {
  const db = betaDb()
  const [row] = await db
    .select({
      purpose: user_setup_token.purpose,
      email: user_setup_token.email,
      organizationName: organization.legal_name,
    })
    .from(user_setup_token)
    .leftJoin(
      organization,
      eq(organization.id, user_setup_token.organization_id),
    )
    .where(
      and(
        eq(user_setup_token.token_hash, hashSetupToken(rawToken)),
        isNull(user_setup_token.consumed_at),
        isNull(user_setup_token.revoked_at),
        gt(user_setup_token.expires_at, sql`now()`),
      ),
    )
    .limit(1)

  if (!row) return null
  return {
    purpose: row.purpose,
    email: row.email,
    organizationName: row.organizationName,
  }
}

/** Sentinel used to abort the transaction with a uniform verdict. */
class ConsumeRejected extends Error {
  constructor(readonly result: Exclude<ConsumeResult, { ok: true }>) {
    super("setup token rejected")
  }
}

export async function consumeSetupToken(
  input: ConsumeInput,
): Promise<ConsumeResult> {
  const db = betaDb()
  const auth = betaAuth()
  const ctx = await auth.$context
  const tokenHash = hashSetupToken(input.rawToken)

  try {
    return await db.transaction(async (tx) => {
      // 1. Atomic claim. Test and take in one statement.
      const [claimed] = await tx
        .update(user_setup_token)
        .set({
          consumed_at: sql`now()`,
          consumed_ip: input.ip,
          consumed_user_agent: input.userAgent,
        })
        .where(
          and(
            eq(user_setup_token.token_hash, tokenHash),
            isNull(user_setup_token.consumed_at),
            isNull(user_setup_token.revoked_at),
            gt(user_setup_token.expires_at, sql`now()`),
          ),
        )
        .returning({
          id: user_setup_token.id,
          purpose: user_setup_token.purpose,
          email: user_setup_token.email,
          organizationId: user_setup_token.organization_id,
          grantedRole: user_setup_token.granted_role,
        })

      if (!claimed) throw new ConsumeRejected({ ok: false, reason: "invalid" })

      // 2. Sibling invalidation: every other live link for the same purpose,
      //    the same address and the same organization dies with this one, so a
      //    re-issued invite cannot be replayed from an older email.
      await tx
        .update(user_setup_token)
        .set({ revoked_at: sql`now()` })
        .where(
          and(
            eq(user_setup_token.purpose, claimed.purpose),
            eq(user_setup_token.email, claimed.email),
            sql`${user_setup_token.organization_id} IS NOT DISTINCT FROM ${claimed.organizationId}`,
            ne(user_setup_token.id, claimed.id),
            isNull(user_setup_token.consumed_at),
            isNull(user_setup_token.revoked_at),
          ),
        )

      // 3. Who is this link for?
      const [existing] = await tx
        .select({
          id: app_user.id,
          disabled_at: app_user.disabled_at,
        })
        .from(app_user)
        .where(eq(app_user.email, claimed.email.toLowerCase()))
        .limit(1)

      // A deactivated account is never re-opened by a link. Deactivation is the
      // offboarding switch; it has to outrank an invite that predates it.
      if (existing && existing.disabled_at !== null) {
        throw new ConsumeRejected({ ok: false, reason: "invalid" })
      }

      const hasCredential = existing
        ? await accountExists(tx, existing.id)
        : false

      let userId: string
      let passwordSet = false

      if (claimed.purpose === "password_reset") {
        // A reset only ever changes an existing credential. No account, or an
        // account that never had a password, is a uniform failure — not an
        // invitation to create one.
        if (!existing || !hasCredential || !input.password) {
          throw new ConsumeRejected({ ok: false, reason: "invalid" })
        }
        userId = existing.id
        await ctx.internalAdapter.updatePassword(
          userId,
          await ctx.password.hash(input.password),
        )
        passwordSet = true

        // Revoke everything. The whole point of a reset is that someone else
        // may know the old password; leaving their sessions alive defeats it.
        await tx.delete(auth_session).where(eq(auth_session.user_id, userId))
      } else if (existing && hasCredential) {
        // The account is already usable. `account_setup` has nothing left to
        // do, and an `org_invite` must NOT be allowed to set a password on an
        // existing account — that would be an account takeover by anyone
        // holding an invite for a known address (Advisor blocker B4-4). Prove
        // the session belongs to that account first.
        if (claimed.purpose === "account_setup") {
          throw new ConsumeRejected({ ok: false, reason: "invalid" })
        }
        if (input.sessionUserId !== existing.id) {
          throw new ConsumeRejected({
            ok: false,
            reason: "signin_required",
            email: claimed.email,
          })
        }
        userId = existing.id
      } else {
        // New account — or the debris of an interrupted earlier attempt (a user
        // row with no credential, which cannot be signed into).
        if (!input.password) {
          throw new ConsumeRejected({ ok: false, reason: "invalid" })
        }
        const passwordHash = await ctx.password.hash(input.password)

        if (existing) {
          userId = existing.id
        } else {
          const created = await ctx.internalAdapter.createUser(
            setupUserPayload({
              email: claimed.email,
              name: input.name?.trim() || claimed.email,
            }),
          )
          if (!created)
            throw new ConsumeRejected({ ok: false, reason: "invalid" })
          userId = created.id
        }

        await ctx.internalAdapter.linkAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: passwordHash,
        })
        passwordSet = true
      }

      // 4. Membership. An org-scoped token always carries a role (DB CHECK
      //    `user_setup_token_scope_pairing`), and `owner` grants are already
      //    restricted at issuance to office staff; the `owner ⇒ is_staff`
      //    trigger is the floor if that ever slips.
      if (claimed.organizationId && claimed.grantedRole) {
        await grantMembership(tx, {
          organizationId: claimed.organizationId,
          userId,
          role: claimed.grantedRole,
        })
      }

      // 5. Forensics: who ended up consuming it. Write-once by trigger.
      await tx
        .update(user_setup_token)
        .set({ consumed_user_id: userId })
        .where(eq(user_setup_token.id, claimed.id))

      return {
        ok: true as const,
        purpose: claimed.purpose,
        email: claimed.email,
        userId,
        organizationId: claimed.organizationId,
        passwordSet,
      }
    })
  } catch (error) {
    if (error instanceof ConsumeRejected) return error.result
    // A trigger rejection (e.g. an owner grant for a non-staff account) is a
    // legitimate refusal, not a bug to leak. Everything else is a real fault
    // and must not be swallowed.
    if (isCheckViolation(error)) return { ok: false, reason: "invalid" }
    throw error
  }
}

type Tx = Parameters<Parameters<BetaDatabase["transaction"]>[0]>[0]

async function accountExists(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: auth_account.id })
    .from(auth_account)
    .where(
      and(
        eq(auth_account.user_id, userId),
        eq(auth_account.provider_id, "credential"),
      ),
    )
    .limit(1)
  return row !== undefined
}

/**
 * Idempotent grant.
 *
 * An ALREADY-ACTIVE membership is left exactly as it is. A link must never
 * change the role of a live membership: an admin may issue `guest` invites, and
 * re-sending one to an existing owner would otherwise be a demotion primitive
 * handed to a lower privilege level. An inactive membership is reactivated with
 * the role the link grants — there is no live privilege to lose there.
 */
async function grantMembership(
  tx: Tx,
  values: { organizationId: string; userId: string; role: BetaOrgRole },
): Promise<void> {
  const [existing] = await tx
    .select({
      id: organization_membership.id,
      active: organization_membership.active,
    })
    .from(organization_membership)
    .where(
      and(
        eq(organization_membership.organization_id, values.organizationId),
        eq(organization_membership.user_id, values.userId),
      ),
    )
    .limit(1)

  if (!existing) {
    await tx.insert(organization_membership).values({
      organization_id: values.organizationId,
      user_id: values.userId,
      role: values.role,
    })
    return
  }

  if (!existing.active) {
    await tx
      .update(organization_membership)
      .set({ active: true, role: values.role })
      .where(eq(organization_membership.id, existing.id))
  }
}

/**
 * Postgres `check_violation` — the class every guard in the migrations raises
 * (owner ⇒ is_staff, last-owner protection, the token CHECKs).
 *
 * The cause chain matters: Drizzle wraps the driver error in a
 * `DrizzleQueryError` that carries no `code` of its own, so reading the top
 * level alone would let a legitimate refusal escape as a 500.
 */
function isCheckViolation(error: unknown): boolean {
  let current: unknown = error
  for (
    let depth = 0;
    current !== null && current !== undefined && depth < 5;
    depth++
  ) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === "23514"
    ) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}
