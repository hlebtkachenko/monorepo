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
import { setupInviteView, type SetupInviteView } from "@/lib/data/projections"
import { isCheckViolation, isDeadlock } from "@/lib/pg-error"

import {
  mayGrantRole,
  mayIssuePurpose,
  resolveReactivationRole,
  type InviteIssuer,
} from "./invite-policy"
import { BETA_SETUP_LINK_TTL_HOURS } from "./policy"
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
 * 5. The purpose gate runs INSIDE the transaction, before any side effect.
 *    `allowedPurposes` is the calling route's own fact (the /setup route
 *    consumes account_setup + org_invite, /reset consumes password_reset), and
 *    it is checked on the claimed row as the first thing after the claim. This
 *    is the carry-in from the PR 06 Advisor gate: with the check outside, a
 *    password_reset link POSTed to /setup would run the whole reset — set the
 *    credential, delete every session, revoke the siblings — and only then
 *    return "invalid". Failing inside the transaction rolls the claim back, so
 *    a wrong-route POST performs nothing and does not burn the link. It still
 *    returns the one uniform failure, so the mismatch is not observable in the
 *    response; the link surviving is not an oracle either, since anyone holding
 *    it can already open the page that names its purpose.
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
 *
 * CLAIMING ONTO AN IDENTITY THAT ALREADY EXISTS is the sharp edge of that
 * resumability, and it is fenced twice.
 *
 * A credential-less `app_user` row is an identity nobody can sign in as — but
 * it can already be `is_staff`, provisioned by /admin and not yet activated.
 * Whoever sets its first password BECOMES it. Meanwhile the issuance guards in
 * the migrations stop a non-staff issuer from granting `owner`, from issuing a
 * `password_reset`, and from issuing an org-less `account_setup` — but they do
 * NOT stop a company admin from issuing an ORG-SCOPED link for any address they
 * like, including an office staff address. So:
 *
 *   - `org_invite` never touches a credential at all when the address already
 *     exists. Credential or not, it demands a session that already belongs to
 *     that identity, and refuses without consuming the link.
 *   - `account_setup` may claim onto an existing credential-less identity only
 *     when the ISSUER is office staff (or the link is the NULL-issuer bootstrap
 *     seed). The issuer's `is_staff` is read in the claim statement itself, and
 *     `issued_by_user_id` is frozen by the migration-0001 immutability trigger,
 *     so the value cannot be rewritten after issuance.
 */

/**
 * What the link screens render. It is the `setupInviteView` projection: the
 * page it feeds is UNAUTHENTICATED, so the column allowlist is the only thing
 * between the visitor and a table whose other columns are the link hash, the
 * issuer and the consume forensics.
 */
export type SetupTokenView = SetupInviteView

export type ConsumeInput = {
  rawToken: string
  /**
   * The purposes the calling route may consume. Not optional: which flows a
   * route serves is a server-side fact every caller has to state, and a default
   * of "all" would make the widest permission the quiet one.
   */
  allowedPurposes: readonly BetaSetupTokenPurpose[]
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
      /**
       * The granted organization's slug, alongside the id — PR 09's first-
       * login routing (`lib/auth/first-login.ts`) needs a URL segment, not a
       * uuid, and the id alone would force the caller to re-look it up. Null
       * exactly when `organizationId` is (an org-less `account_setup` grant,
       * or `password_reset`, which is never org-scoped).
       */
      organizationSlug: string | null
      /**
       * The role this consume granted — null exactly when `organizationId`
       * is (the `user_setup_token_scope_pairing` CHECK keeps the two in
       * lockstep). Also PR 09: `firstLoginPath` branches on it.
       */
      grantedRole: BetaOrgRole | null
      /** False when the flow only granted membership to an existing account. */
      passwordSet: boolean
    }
  | { ok: false; reason: "invalid" }
  /**
   * A lock cycle picked this transaction as the victim. The link was NOT
   * consumed (the transaction rolled back), so the honest answer is "try
   * again" — telling the holder of a perfectly good link that it is invalid
   * would send them back to the office for a replacement they do not need.
   */
  | { ok: false; reason: "retry" }
  /**
   * The invite is real, but this account already exists — prove it is you.
   *
   * DELIBERATELY DISTINGUISHABLE FROM `invalid` (decision recorded at the PR 21
   * gate, carried in from the PR 06 gate as a possible B4-4 uniformity
   * deviation). KEPT distinguishable, for three reasons:
   *
   *   1. B4-4's uniformity requirement is about the TOKEN ORACLE — expired,
   *      revoked, already-used and never-existed must be indistinguishable, so a
   *      stranger grinding token-shaped URLs learns nothing. This arm is
   *      unreachable without a VALID, unexpired, unconsumed link, so it answers
   *      no question about a token anyone is guessing at.
   *   2. The residual disclosure is "the address on this invite already has an
   *      identity here" — to someone who is already holding an invite the OFFICE
   *      issued for that address, on a screen (`peekSetupToken`) that already
   *      renders the address and the organization's legal name. It tells the
   *      holder nothing they were not deliberately told.
   *   3. Making it uniform would strand a real and common case: an accountant or
   *      a company owner who already has a beta account, invited into a second
   *      book. Refusing does NOT consume the link, so "invalid" would be a
   *      permanent dead end for them — they would go back to the office for a
   *      replacement that behaves identically. A security-neutral message
   *      becomes a support call.
   *
   * The takeover guard itself (B4-4's actual demand) is unchanged and is what
   * produces this arm: an `org_invite` for an existing identity NEVER sets a
   * credential, whatever the session says. See the branch in `consumeSetupToken`.
   */
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

// ---------------------------------------------------------------------------
// Issuance — the other half of the link's life
// ---------------------------------------------------------------------------

/**
 * Who is handing out the link, as the calling door already proved it.
 *
 * `office` comes from a resolved `OfficeScope` (/admin, PR 08); `organization`
 * from a resolved `OrgScope` (Nastavení › Lidé, PR 22). The two share this one
 * function so the invite matrix cannot drift between them, and neither of them
 * can name an issuer id that is not their own signed-in user.
 */
type SetupLinkIssuer =
  | { readonly kind: "office"; readonly userId: string }
  | {
      readonly kind: "organization"
      readonly userId: string
      readonly organizationId: string
      readonly role: BetaOrgRole
    }

export type IssueSetupTokenInput = {
  readonly purpose: BetaSetupTokenPurpose
  readonly email: string
  readonly organizationId?: string | null
  readonly grantedRole?: BetaOrgRole | null
  readonly issuer: SetupLinkIssuer
  readonly ip: string | null
  readonly userAgent: string | null
}

/**
 * THE ONLY TIME THE RAW SECRET EXISTS OUTSIDE THE LINK.
 *
 * `token` is returned to the caller once, travels to the office user's screen
 * once, and is never persisted, never logged and never re-derivable: the table
 * holds `sha256(token)` and nothing else. `listSetupLinks` (the /admin
 * registry) has no field for it, by construction rather than by omission — see
 * `officeSetupLinkSummary` in `lib/data/projections.ts`.
 */
export type IssuedSetupLink = {
  readonly id: string
  readonly token: string
  readonly purpose: BetaSetupTokenPurpose
  readonly email: string
  readonly expiresAt: Date
}

export type IssueSetupTokenRejection =
  /** Not a usable address — checked before anything is generated. */
  | "invalid_email"
  /** This issuer may not mint this kind of link at all. */
  | "purpose_not_allowed"
  /** This issuer may not grant this role (admin → owner is the live case). */
  | "role_not_allowed"
  /** Organization + role pairing wrong, or an org issuer aiming elsewhere. */
  | "scope_mismatch"
  /**
   * The organization has been archived. An invite into a withdrawn book is a
   * link that resolves to a 404 the moment it is consumed (`requireScope`
   * refuses an archived organization), so minting one is never what the office
   * meant. Archiving also revokes the ones already outstanding — trigger
   * `organization_archive_revokes_setup_tokens`, migration 0003 — and this is
   * the other half: without it the office can re-mint into the same book right
   * after archiving it.
   */
  | "organization_archived"
  /** A database guard refused it. The floor did its job; say no, quietly. */
  | "rejected"

export type IssueSetupTokenResult =
  | { ok: true; link: IssuedSetupLink }
  | { ok: false; reason: IssueSetupTokenRejection }

/**
 * Deliberately loose. The address is a routing fact the office types in, not a
 * credential, and an over-clever pattern rejects legitimate mail more often
 * than it catches a typo. The DB column is `varchar(320)`; the lowercasing is
 * done by trigger as well, and repeated here so the value this function
 * RETURNS matches the value it stored.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
const EMAIL_MAX_LENGTH = 320

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null
  return EMAIL_PATTERN.test(email) ? email : null
}

/**
 * Mint a one-time link.
 *
 * FOUR GATES, IN THIS ORDER, AND ALL OF THEM BEFORE THE SECRET IS GENERATED:
 *
 *   1. the address parses;
 *   2. this issuer may mint this PURPOSE (`invite-policy.ts`);
 *   3. this issuer may grant this ROLE — the admin-never-owner rule;
 *   4. the purpose, the organization and the role are a coherent triple, and an
 *      organization issuer is aiming at their OWN organization.
 *
 * Then the database re-checks 2-4 from its own side
 * (`beta_setup_token_issuer_guard`, the `user_setup_token_*` CHECKs), which is
 * why a `check_violation` here is answered as a plain refusal rather than
 * raised: the floor catching something the gates let through is a refusal, not
 * a fault, and the caller must not be able to tell the two apart.
 *
 * The TTL is fixed at {@link BETA_SETUP_LINK_TTL_HOURS} and is not a parameter.
 * A caller-supplied lifetime is a knob whose only interesting value is "longer",
 * and the 72h ceiling is a DB CHECK, so the useful range is one number.
 */
export async function issueSetupToken(
  input: IssueSetupTokenInput,
): Promise<IssueSetupTokenResult> {
  const email = normalizeEmail(input.email)
  if (!email) return { ok: false, reason: "invalid_email" }

  const issuer: InviteIssuer =
    input.issuer.kind === "office"
      ? { kind: "office" }
      : { kind: "organization", role: input.issuer.role }

  if (!mayIssuePurpose(issuer, input.purpose)) {
    return { ok: false, reason: "purpose_not_allowed" }
  }

  const organizationId = input.organizationId ?? null
  const grantedRole = input.grantedRole ?? null

  if (grantedRole !== null && !mayGrantRole(issuer, grantedRole)) {
    return { ok: false, reason: "role_not_allowed" }
  }

  // Mirrors the CHECK constraints so the caller gets a named reason instead of
  // a constraint name, and so an incoherent triple never reaches the database.
  if ((organizationId === null) !== (grantedRole === null)) {
    return { ok: false, reason: "scope_mismatch" }
  }
  if (input.purpose === "password_reset" && organizationId !== null) {
    return { ok: false, reason: "scope_mismatch" }
  }
  if (input.purpose === "org_invite" && organizationId === null) {
    return { ok: false, reason: "scope_mismatch" }
  }
  if (
    input.issuer.kind === "organization" &&
    organizationId !== input.issuer.organizationId
  ) {
    return { ok: false, reason: "scope_mismatch" }
  }

  // An archived book admits nobody: `requireScope` refuses it, so an invite
  // into one is a link whose only possible outcome is a 404 for the invitee.
  // The check races with a concurrent archive, and that is fine — the archive
  // trigger (0003) revokes whatever slipped through moments later. It is not a
  // substitute for the trigger; it is what stops the office from re-minting
  // into a book it has just withdrawn.
  if (organizationId !== null) {
    const [book] = await betaDb()
      .select({ archived_at: organization.archived_at })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)

    // A missing organization falls through to the FK, which refuses it as a
    // plain `rejected` — the caller learns nothing about which ids exist.
    if (book && book.archived_at !== null) {
      return { ok: false, reason: "organization_archived" }
    }
  }

  const token = generateSetupToken()

  try {
    const [row] = await betaDb()
      .insert(user_setup_token)
      .values({
        purpose: input.purpose,
        token_hash: hashSetupToken(token),
        email,
        organization_id: organizationId,
        granted_role: grantedRole,
        issued_by_user_id: input.issuer.userId,
        issued_ip: input.ip,
        issued_user_agent: input.userAgent,
        expires_at: sql`now() + ${`${BETA_SETUP_LINK_TTL_HOURS} hours`}::interval`,
      })
      .returning({
        id: user_setup_token.id,
        expiresAt: user_setup_token.expires_at,
      })

    if (!row) return { ok: false, reason: "rejected" }

    return {
      ok: true,
      link: {
        id: row.id,
        token,
        purpose: input.purpose,
        email,
        expiresAt: row.expiresAt,
      },
    }
  } catch (error) {
    if (isCheckViolation(error)) return { ok: false, reason: "rejected" }
    throw error
  }
}

/**
 * Where a link points.
 *
 * ENV-FIRST, never request-derived: behind the Cloudflare Tunnel a request's
 * own URL is the container listener, so an origin built from it would produce a
 * link to an address that does not exist off-box (ADR-0008 amendment 2, and the
 * same reason `server.ts` reads `BETTER_AUTH_URL` for `baseURL`). With no base
 * configured — local development — the result is a root-relative path, which is
 * still correct against whatever host the operator is using.
 */
function setupLinkPath(
  link: Pick<IssuedSetupLink, "purpose" | "token">,
): string {
  const segment = link.purpose === "password_reset" ? "reset" : "setup"
  return `/${segment}/${encodeURIComponent(link.token)}`
}

export function setupLinkUrl(
  link: Pick<IssuedSetupLink, "purpose" | "token">,
): string {
  const base = process.env["BETTER_AUTH_URL"]?.trim().replace(/\/+$/, "") ?? ""
  return `${base}${setupLinkPath(link)}`
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
  return setupInviteView(row)
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
          /**
           * Was this link issued by office staff? Read in the claim statement
           * itself, as a scalar subquery rather than a join, because
           * `issued_by_user_id` is nullable and an inner join would silently
           * stop the bootstrap seed (issuer NULL) from ever being claimable.
           *
           *   true  → office staff
           *   false → a company admin issuing inside their own organization
           *   null  → no issuer: the bootstrap seed
           *
           * The outer column is the TABLE-QUALIFIED literal, not an
           * interpolated Drizzle column: interpolation emits a bare
           * `"issued_by_user_id"`, which resolves against the subquery's own
           * `app_user` first and only falls through to the outer query because
           * `app_user` happens not to have a column by that name today. The day
           * it does, this silently starts comparing a user to itself and every
           * link reads as staff-issued.
           */
          issuerIsStaff: sql<
            boolean | null
          >`(SELECT u.is_staff FROM app_user u WHERE u.id = user_setup_token.issued_by_user_id)`,
          /**
           * The granted organization's slug (PR 09: `firstLoginPath` needs a
           * URL segment). Same reasoning as `issuerIsStaff` above: a scalar
           * subquery on the table-qualified, literal `organization_id`
           * rather than a join, because `organization_id` is nullable and an
           * inner join would drop every org-less grant from the RETURNING
           * set entirely instead of returning it with a null slug.
           */
          organizationSlug: sql<
            string | null
          >`(SELECT o.slug FROM organization o WHERE o.id = user_setup_token.organization_id)`,
        })

      if (!claimed) throw new ConsumeRejected({ ok: false, reason: "invalid" })

      // 2. Purpose gate. FIRST thing after the claim and before every side
      //    effect, so a link POSTed to the wrong route changes nothing at all:
      //    throwing here rolls the claim back with the transaction.
      if (!input.allowedPurposes.includes(claimed.purpose)) {
        throw new ConsumeRejected({ ok: false, reason: "invalid" })
      }

      // 3. Sibling invalidation: every other live link for the same purpose,
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

      // 4. Who is this link for?
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
      } else if (claimed.purpose === "org_invite" && existing) {
        // An invite for an address that already has an identity grants
        // MEMBERSHIP and nothing else — it never sets a credential, whether or
        // not one exists yet.
        //
        // With a credential, setting one would be an account takeover by anyone
        // holding an invite for a known address (Advisor blocker B4-4). WITHOUT
        // one it is worse: a credential-less row can be a provisioned-but-
        // unactivated `is_staff` identity, and the issuance guards do not stop a
        // company admin from issuing an org-scoped invite for an arbitrary
        // address — so that path would hand /admin to whoever clicked. Both
        // cases demand a session that already belongs to this identity.
        //
        // Refusing does NOT consume the link: the invitee signs in and opens it
        // again. (A credential-less identity has no way to sign in, so this is
        // simply a wall for it — which is the point.)
        if (input.sessionUserId !== existing.id) {
          throw new ConsumeRejected({
            ok: false,
            reason: "signin_required",
            email: claimed.email,
          })
        }
        userId = existing.id
      } else if (existing) {
        // `account_setup` onto an identity that already exists.
        //
        // A usable account has nothing left to set up. A credential-less one is
        // the resumable debris of an interrupted earlier attempt — but claiming
        // it means becoming it, so only office staff (or the NULL-issuer
        // bootstrap seed) may hand out a link that does so. A company admin's
        // link is refused, and refusing does not burn it.
        if (hasCredential || claimed.issuerIsStaff === false) {
          throw new ConsumeRejected({ ok: false, reason: "invalid" })
        }
        if (!input.password) {
          throw new ConsumeRejected({ ok: false, reason: "invalid" })
        }
        userId = existing.id
        await ctx.internalAdapter.linkAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: await ctx.password.hash(input.password),
        })
        passwordSet = true
      } else {
        // A brand-new identity: nothing exists to be claimed.
        if (!input.password) {
          throw new ConsumeRejected({ ok: false, reason: "invalid" })
        }
        const passwordHash = await ctx.password.hash(input.password)

        const created = await ctx.internalAdapter.createUser(
          setupUserPayload({
            email: claimed.email,
            name: input.name?.trim() || claimed.email,
          }),
        )
        if (!created)
          throw new ConsumeRejected({ ok: false, reason: "invalid" })
        userId = created.id

        await ctx.internalAdapter.linkAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: passwordHash,
        })
        passwordSet = true
      }

      // 5. Membership. An org-scoped token always carries a role (DB CHECK
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

      // 6. Forensics: who ended up consuming it. Write-once by trigger.
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
        organizationSlug: claimed.organizationSlug,
        grantedRole: claimed.grantedRole,
        passwordSet,
      }
    })
  } catch (error) {
    if (error instanceof ConsumeRejected) return error.result
    // A lock-cycle victim: the whole transaction rolled back, so the link is
    // still unconsumed and the only true thing to say is "try again". This
    // arm has to sit ABOVE the check-violation arm — reporting it as `invalid`
    // would burn a link in the user's mind that the database never touched.
    if (isDeadlock(error)) return { ok: false, reason: "retry" }
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
 * handed to a lower privilege level.
 *
 * AN INACTIVE MEMBERSHIP IS REACTIVATED AT `max(stored, granted)`, NOT AT THE
 * LINK'S ROLE. The earlier version wrote the link's role unconditionally, on the
 * reasoning that an inactive row has "no live privilege to lose". That reasoning
 * was wrong in one direction: the row is dormant, not empty, and a deactivated
 * OWNER row reactivated by an admin-issued `guest` link came back as a guest —
 * the exact demotion primitive the paragraph above refuses for the active case,
 * reachable by deactivating first. `beta_prevent_last_owner_removal` does not
 * cover it either, because the row was never an ACTIVE owner during the write.
 * The rule itself lives in `invite-policy.ts` next to the rest of the matrix;
 * see `resolveReactivationRole` for why it is a maximum rather than a refusal.
 */
async function grantMembership(
  tx: Tx,
  values: { organizationId: string; userId: string; role: BetaOrgRole },
): Promise<void> {
  const [existing] = await tx
    .select({
      id: organization_membership.id,
      active: organization_membership.active,
      role: organization_membership.role,
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
      .set({
        active: true,
        role: resolveReactivationRole(existing.role, values.role),
      })
      .where(eq(organization_membership.id, existing.id))
  }
}
