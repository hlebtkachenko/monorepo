import "server-only"

import { notFound, redirect } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  agent_key,
  app_user,
  organization,
  organization_membership,
  type BetaOrgRole,
} from "@/db/schema"
import { getBetaSession } from "@/lib/auth/session"
import {
  requiresTotpEnrolment,
  TOTP_ENROLMENT_PATH,
} from "@/lib/auth/totp-enforcement"

import { isValidOrgSlugFormat } from "./org-slug"

/**
 * The tenancy seam — the inner wall.
 *
 * The outer wall is the database itself: beta owns its RDS instance and shares
 * no table with the main product (plan Part 1). Inside that database every
 * organization lives in the same tables with no RLS (plan Part 4), so what keeps
 * one client's book out of another's page is THIS module and nothing else.
 *
 * TWO DOORS FOR A HUMAN, AND NO THIRD ONE. `requireScope` (an organization) and
 * `requireOffice` (the cross-org office area) are the only functions that
 * produce a scope handle for a signed-in person. The brand symbols are
 * module-private, so no other file — not a route, not a test, not a future data
 * module — can build one by hand: an object literal shaped like `OrgScope` is a
 * type error, because the symbol key it would need is not in scope anywhere
 * else. A data function that takes `OrgScope` is therefore provably reachable
 * only through a resolved membership.
 *
 * THE AGENT DOOR (PR 24) IS NOT A THIRD AUTHORITY. `resolveAgentScope` /
 * `resolveAgentOwnerScope` at the bottom of this file admit the office's own
 * ingestion agent, and they deliberately end in the SAME membership query the
 * human door runs — with `agent_key.acting_user_id` as the user. An agent key is
 * the non-interactive form of one accountant's authority: it can reach exactly
 * the books that accountant can, it dies when that account is deactivated, and
 * it grants no role the human does not already hold. It lives HERE, next to its
 * siblings, because "every scope in this application is minted in one file" is
 * the property `scope-brand-fence.boundary.test.ts` enforces and a second brand
 * home would be a second place to audit.
 *
 * WHY EVERY REFUSAL IS 404. Unknown slug, no session, no membership, an
 * inactive membership, a deactivated user, an archived organization — all six
 * end in `notFound()`. A 403 would answer a question the caller is not entitled
 * to ask: it distinguishes "this organization does not exist" from "it exists
 * and you are not in it", which is a membership oracle over a URL space of
 * guessable company slugs. The client of an accounting office should not be
 * able to enumerate the office's other clients.
 *
 * (The friendly redirect for a signed-out visitor still happens, one level up:
 * `app/(portal)/layout.tsx` calls `requireBetaSession()`, which redirects to
 * /sign-in before any page body runs. The 404 here is the floor underneath it,
 * for the case where a route is ever mounted outside that layout.)
 *
 * ONE QUERY, ALL SIX CONDITIONS. The resolution is a single statement joining
 * membership → organization → user. Splitting it into "find the org, then check
 * the membership" is what produces the classic leak: the first query's failure
 * mode differs from the second's, and the difference is observable in timing
 * and in code paths. Here there is one row or no row.
 *
 * THE SECOND FACTOR IS PART OF THE SEAM (PR 22, Advisor carry-in from PR 21).
 * The forced-TOTP mandate used to live in two LAYOUTS — `(portal)/layout.tsx`
 * and `app/admin/layout.tsx` — which covers every page render and nothing else.
 * A Server Action is not a page render: it is a POST to the same route that
 * runs its own `requireScope` / `requireOffice` and never re-enters the layout
 * above it, so an unenrolled office account whose browser still held the tab
 * open could invoke any write in this application. Route handlers are the same
 * gap by the same mechanism. So the mandate is asserted HERE, where every
 * authority in the app is minted, and the layouts keep their own call purely
 * for the friendly redirect on a first navigation.
 *
 * IT COSTS NO EXTRA QUERY. `resolveOrgScope` already joins `app_user`, so
 * `two_factor_enabled` comes back in the row that is already being read, and
 * the predicate itself (`lib/auth/totp-enforcement.ts`) is pure. The `isStaff`
 * disjunct is what makes the org-scoped answer complete: an owner membership is
 * only ever held by office staff (DB trigger), so anybody under the mandate
 * anywhere in the database carries `is_staff` on the very row this join reads.
 *
 * WHO IS UNAFFECTED. `admin`, `member` and `guest` — the client's own people —
 * are not under the mandate at all, and the agent door is exempt by
 * construction: an API key is not an interactive session, it carries no browser
 * to enrol from, and the authority it acts as is already floored by `is_staff`
 * and `disabled_at` on every request.
 *
 * NARROWING LATER (spec §2.6.1, PR 32). The employee seat is a `guest`
 * membership linked to a `payroll_employee` row, and it sees only its own
 * payroll. That is a NARROWING of this handle, not a new one: it arrives as one
 * more LEFT JOIN in `resolveOrgScope` and one more readonly field on `OrgScope`,
 * which `payrollScope()` then reads. Nothing that consumes a scope today has to
 * change for that to land — which is why the handle carries resolved facts
 * rather than a role string callers re-interpret.
 */

const orgScopeBrand = Symbol("beta.OrgScope")
const officeScopeBrand = Symbol("beta.OfficeScope")
const ownerScopeBrand = Symbol("beta.OwnerScope")
const agentScopeBrand = Symbol("beta.AgentScope")

/**
 * Proof that a specific user holds a specific active membership in a specific
 * live organization. Every organization-scoped query takes one of these and
 * filters on `organizationId`.
 */
export type OrgScope = {
  readonly [orgScopeBrand]: true
  readonly organizationId: string
  /** The canonical slug as stored, not as typed into the URL. */
  readonly organizationSlug: string
  readonly userId: string
  readonly role: BetaOrgRole
  /**
   * Office staff (`app_user.is_staff`). Recorded because an owner membership
   * is only ever held by staff and some office-internal surfaces inside an
   * organization key off it — never serialized to a client (`projections.ts`).
   */
  readonly isStaff: boolean
  /**
   * Whether this holder satisfies the forced-TOTP mandate — `true` for every
   * client-side role (they are not under it) and for an office account that has
   * enrolled. It is a RESOLVED VERDICT, not `two_factor_enabled`: the raw column
   * is on `CLIENT_FORBIDDEN_COLUMNS` and never leaves the server, and carrying
   * the answer rather than the input means `requireOwner` can assert it without
   * becoming async.
   */
  readonly totpSatisfied: boolean
}

/**
 * Proof that the caller is office staff. The cross-org /admin area (PR 08)
 * cannot be gated by an organization role — it is above organizations — so it
 * gets its own door (Advisor blocker B4-6, there named
 * `requireAccountantGlobal`).
 */
export type OfficeScope = {
  readonly [officeScopeBrand]: true
  readonly userId: string
  readonly isStaff: true
}

/**
 * Resolve the signed-in user's scope in `orgSlug`, or answer 404.
 *
 * Refuses identically for: no session, malformed slug, unknown organization,
 * archived organization, no membership, inactive membership, deactivated user.
 *
 * THE ONE NON-404 REFUSAL is the second-factor mandate, which redirects to the
 * enrolment screen instead. It is not a tenancy answer — the caller genuinely
 * holds this membership and the 404 doctrine exists to avoid confirming that
 * they do not — so sending them somewhere they can fix it is both safe (they
 * already know the organization exists) and the only outcome that is not a dead
 * end. `resolveOrgScope`, the arm route handlers use, collapses it back into
 * `null`: a 307 to an HTML enrolment page is not a useful answer to a fetch for
 * a file.
 */
export async function requireScope(orgSlug: string): Promise<OrgScope> {
  const resolution = await resolveScopeOutcome(orgSlug)
  if (resolution.outcome === "totp_required") redirect(TOTP_ENROLMENT_PATH)
  if (resolution.outcome !== "ok") notFound()
  return resolution.scope
}

/**
 * The same resolution, expressed as `null` instead of a thrown 404.
 *
 * ONE DOOR, TWO FAILURE EXPRESSIONS — not a second door. Everything below this
 * line used to be the body of `requireScope`, which now calls it; there is
 * still exactly one query, one set of six conditions and one place a brand is
 * minted.
 *
 * ROUTE HANDLERS ARE THE REASON. `notFound()` works by throwing a Next-internal
 * error that the RENDERER catches to swap in the 404 page. A Route Handler has
 * no renderer: the throw escapes as a 500 in some paths, and — worse for a
 * security seam — a test that calls the exported handler directly sees an
 * exception rather than a response, so "cross-org access answers 404" becomes
 * an assertion about an error object instead of about the thing the client
 * receives. Pages keep using `requireScope`; the two file routes use this and
 * return a real `404` Response.
 */
export async function resolveOrgScope(
  orgSlug: string,
): Promise<OrgScope | null> {
  const resolution = await resolveScopeOutcome(orgSlug)
  return resolution.outcome === "ok" ? resolution.scope : null
}

/**
 * The single resolution both public doors project, and the only place an
 * `OrgScope` for a human is minted.
 *
 * It exists so the two doors can tell the mandate apart from a tenancy refusal
 * WITHOUT either of them running its own query: `requireScope` redirects to the
 * enrolment screen, `resolveOrgScope` answers `null` like every other failure,
 * and neither can drift from the other about what a resolved membership is.
 */
type ScopeResolution =
  | { readonly outcome: "ok"; readonly scope: OrgScope }
  /** Any of the six tenancy conditions. Indistinguishable, on purpose. */
  | { readonly outcome: "denied" }
  /** A real membership held by an office account that has not enrolled. */
  | { readonly outcome: "totp_required" }

async function resolveScopeOutcome(orgSlug: string): Promise<ScopeResolution> {
  const session = await getBetaSession()
  if (!session) return { outcome: "denied" }

  // A slug that cannot exist is answered without a round trip. The DB CHECK
  // means a non-matching string can never be stored, so this is a shortcut and
  // not a second, weaker validation. The rule itself lives in `org-slug.ts`,
  // shared with the /admin create form so the two cannot disagree about what a
  // slug is.
  if (!isValidOrgSlugFormat(orgSlug)) return { outcome: "denied" }

  const [row] = await betaDb()
    .select({
      organizationId: organization.id,
      organizationSlug: organization.slug,
      role: organization_membership.role,
      isStaff: app_user.is_staff,
      twoFactorEnabled: app_user.two_factor_enabled,
    })
    .from(organization_membership)
    .innerJoin(
      organization,
      eq(organization.id, organization_membership.organization_id),
    )
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    .where(
      and(
        eq(organization.slug, orgSlug),
        eq(organization_membership.user_id, session.userId),
        // Membership rows are the ONLY visibility mechanism. There is no staff
        // bypass: an accountant without a membership in this organization gets
        // the same 404 as a stranger (Advisor Part 4 — an implicit bypass
        // multiplies the offboarding surface). /admin grants the memberships.
        eq(organization_membership.active, true),
        isNull(organization.archived_at),
        // Redundant with `getBetaSession`, which drops a session whose user has
        // been deactivated. Kept because this seam must be fail-closed on its
        // own terms: it costs nothing in a join that is already happening, and
        // it means a future caller that resolves a session differently cannot
        // re-open a deactivated account's access.
        isNull(app_user.disabled_at),
      ),
    )
    .limit(1)

  if (!row) return { outcome: "denied" }

  // `hasOwnerMembership` is answered from THIS organization's role rather than
  // from a second cross-org query, and that is complete rather than a shortcut:
  // an owner membership implies `is_staff` (DB trigger
  // `organization_membership_owner_requires_staff`), so anybody holding one
  // anywhere is already caught by the `isStaff` disjunct on the row above.
  if (
    requiresTotpEnrolment({
      isStaff: row.isStaff,
      hasOwnerMembership: row.role === "owner",
      twoFactorEnabled: row.twoFactorEnabled,
    })
  ) {
    return { outcome: "totp_required" }
  }

  const scope: OrgScope = {
    [orgScopeBrand]: true,
    organizationId: row.organizationId,
    organizationSlug: row.organizationSlug,
    userId: session.userId,
    role: row.role,
    isStaff: row.isStaff,
    totpSatisfied: true,
  }
  return { outcome: "ok", scope: Object.freeze(scope) }
}

/**
 * Resolve the signed-in user as office staff, or answer 404.
 *
 * THE MANDATE IS UNCONDITIONAL HERE. `requireOffice` has already established
 * `is_staff`, which is one half of `requiresTotpEnrolment`'s disjunction on its
 * own — so every caller that gets past the 404 is under the mandate, and the
 * only remaining question is whether they have enrolled. Like `requireScope`,
 * this reads the flag from the row it was already fetching.
 */
export async function requireOffice(): Promise<OfficeScope> {
  const session = await getBetaSession()
  if (!session) notFound()

  const [row] = await betaDb()
    .select({
      isStaff: app_user.is_staff,
      twoFactorEnabled: app_user.two_factor_enabled,
    })
    .from(app_user)
    .where(and(eq(app_user.id, session.userId), isNull(app_user.disabled_at)))
    .limit(1)

  if (!row?.isStaff) notFound()
  if (!row.twoFactorEnabled) redirect(TOTP_ENROLMENT_PATH)

  const office: OfficeScope = {
    [officeScopeBrand]: true,
    userId: session.userId,
    isStaff: true,
  }
  return Object.freeze(office)
}

/**
 * Owner-only surfaces inside an organization: Pro účetní, the internal layer,
 * and every accounting write (spec §5). owner IS the accountant in the final
 * role model, so this is the Advisor's `assertAccountant` under the name the
 * role model actually uses.
 *
 * It answers 404 rather than 403 for the same reason `requireScope` does — a
 * 403 on /ucetni would confirm the section exists for someone. The write layer
 * that lands later may still answer 403 on a POST, where the caller already
 * knows the surface exists because it rendered for them.
 */
export function assertOwner(scope: OrgScope): void {
  if (scope.role !== "owner") notFound()
}

/**
 * Proof that a specific `OrgScope` also holds the `owner` role — the office
 * side's write handle (PR 14, Pro účetní › Zpracování). Everything `OrgScope`
 * proves still holds (an `OwnerScope` is one, structurally: every field is
 * still there, plus the second brand), so a function that used to take
 * `OrgScope` keeps working unchanged if it is ever handed one.
 *
 * WHY A SECOND BRAND AND NOT JUST `assertOwner` EVERYWHERE. `assertOwner` is a
 * plain `void` function, not a TypeScript assertion signature (`asserts scope
 * is ...`), because `OrgScope.role` is a plain string field the compiler
 * cannot narrow through a function call — so every caller re-proves "is this
 * the owner" only by convention, at the top of every write, and a write added
 * later that forgets the call still type-checks. `requireOwner` moves that
 * proof into the TYPE: a data function that declares its first parameter as
 * `OwnerScope` cannot be called with a bare `OrgScope` at all, so "this write
 * is owner-only" becomes a compile error to get wrong, the same way `OrgScope`
 * itself already makes "this read is tenant-scoped" one. `lib/data/documents-
 * office.ts` is the first, and so far only, consumer.
 *
 * NOT A REPLACEMENT FOR `assertOwner`. Pages still gate with `assertOwner` (or
 * this) directly against a freshly resolved `OrgScope` — there is no
 * `requireOwner(orgSlug)` shorthand, on purpose: minting the handle from an
 * already-resolved scope keeps `requireScope` the only function that ever
 * touches the database for tenancy, exactly as `requireOffice` does not
 * re-derive a session either.
 */
export type OwnerScope = OrgScope & {
  readonly [ownerScopeBrand]: true
  readonly role: "owner"
}

export function requireOwner(scope: OrgScope): OwnerScope {
  if (scope.role !== "owner") notFound()
  // A floor, not the enforcement: `requireScope` already refused an unenrolled
  // office account, so a scope reaching here with `totpSatisfied: false` cannot
  // come from the human door. It is asserted anyway because this function is the
  // gate on every accounting WRITE in the application, and the cost of it being
  // wrong once (a second minter added later, a test constructing a scope) is not
  // symmetric with the cost of one boolean comparison. Synchronous, because the
  // verdict is carried on the handle — 73 call sites do not become async for it.
  if (!scope.totpSatisfied) redirect(TOTP_ENROLMENT_PATH)

  const owner: OwnerScope = {
    ...scope,
    [ownerScopeBrand]: true,
    role: "owner",
  }
  return Object.freeze(owner)
}

// ---------------------------------------------------------------------------
// The agent door (spec §3.2 — the office's ingestion agent)
// ---------------------------------------------------------------------------

/**
 * Proof that a live office agent key presented itself, and which office account
 * it acts as.
 *
 * It is NOT an organization handle: it carries no `organizationId` a query could
 * filter on, on purpose. Reaching a book still costs a second resolution
 * (`resolveAgentOwnerScope`), so no ingestion write can be addressed by anything
 * this object alone contains.
 */
export type AgentScope = {
  readonly [agentScopeBrand]: true
  readonly keyId: string
  readonly label: string
  /** The one book this key is confined to, or null for an office-global key. */
  readonly organizationId: string | null
  /** The office account whose authority this key carries. */
  readonly actingUserId: string
}

/**
 * Resolve a presented key hash into an agent scope, or `null`.
 *
 * Refuses identically for: an unknown hash, a revoked key, a key whose acting
 * account has lost `is_staff`, and a key whose acting account is deactivated.
 * The caller answers ALL of them with the same 401 — a distinguishable error
 * would turn this endpoint into an oracle for "is this key real but revoked",
 * which is exactly the question an attacker holding a stale key wants answered.
 *
 * ONE QUERY, ALL FOUR CONDITIONS, for the same reason `resolveOrgScope` is one
 * query: two statements have two failure modes and the difference is observable.
 *
 * The lookup is BY HASH, so the raw secret is never compared, never logged and
 * never travels further than the request. Constant-time comparison is not a
 * consideration here — the index lookup either finds a row or does not, and
 * every miss costs the same one indexed probe.
 */
export async function resolveAgentScope(
  keyHash: string,
): Promise<AgentScope | null> {
  const [row] = await betaDb()
    .select({
      keyId: agent_key.id,
      label: agent_key.label,
      organizationId: agent_key.organization_id,
      actingUserId: agent_key.acting_user_id,
    })
    .from(agent_key)
    .innerJoin(app_user, eq(app_user.id, agent_key.acting_user_id))
    .where(
      and(
        eq(agent_key.key_hash, keyHash),
        isNull(agent_key.revoked_at),
        // The live half of migration 0011's issuance trigger: `is_staff` can be
        // revoked after a key is issued, and a credential must never outlive the
        // access of the human it acts as.
        eq(app_user.is_staff, true),
        isNull(app_user.disabled_at),
      ),
    )
    .limit(1)

  if (!row) return null

  const agent: AgentScope = {
    [agentScopeBrand]: true,
    keyId: row.keyId,
    label: row.label,
    organizationId: row.organizationId,
    actingUserId: row.actingUserId,
  }
  return Object.freeze(agent)
}

/**
 * Resolve the book named by `orgSlug` for this key, as an `OwnerScope`, or
 * `null`.
 *
 * WHERE THE ORGANIZATION COMES FROM. The URL, never the payload — spec §3.2's
 * "NO org_id inference from payload beyond the key's scope". A body that names a
 * tenant is refused before this function is reached (`lib/agent/schemas.ts`), so
 * there is exactly one place in the request a book can be named and exactly one
 * check on it:
 *
 *   - ORG-SCOPED key (`organizationId` set): the slug must resolve to THAT
 *     organization. Any other slug — real or not — is `null`, i.e. a 404.
 *   - OFFICE-GLOBAL key (`organizationId` null): the slug may name any book, and
 *     the membership join below is what decides whether this key reaches it.
 *
 * THE MEMBERSHIP JOIN IS THE SAME ONE `resolveOrgScope` RUNS, with the key's
 * acting user in place of a session user and `role = 'owner'` added. That
 * sameness is the point: an agent cannot reach a book its accountant cannot,
 * cannot outlive an offboarding, and cannot hold a role nobody granted. There is
 * no staff bypass here either — `is_staff` admits nobody to a book by itself.
 *
 * It returns an `OwnerScope` because agent writes are office writes: the
 * ingestion API feeds the same Zadávání dat / Měsíční uzávěrka surfaces the
 * accountant types into, and reusing the brand means every write it can perform
 * is a write `lib/data/*` already gates as owner-only. Nothing about the CLIENT
 * tiers changes — no agent path produces an `OrgScope` for a non-owner role.
 */
export async function resolveAgentOwnerScope(
  agent: AgentScope,
  orgSlug: string,
): Promise<OwnerScope | null> {
  if (!isValidOrgSlugFormat(orgSlug)) return null

  const [row] = await betaDb()
    .select({
      organizationId: organization.id,
      organizationSlug: organization.slug,
      isStaff: app_user.is_staff,
    })
    .from(organization_membership)
    .innerJoin(
      organization,
      eq(organization.id, organization_membership.organization_id),
    )
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    .where(
      and(
        eq(organization.slug, orgSlug),
        eq(organization_membership.user_id, agent.actingUserId),
        eq(organization_membership.role, "owner"),
        eq(organization_membership.active, true),
        isNull(organization.archived_at),
        isNull(app_user.disabled_at),
        agent.organizationId === null
          ? undefined
          : eq(organization.id, agent.organizationId),
      ),
    )
    .limit(1)

  if (!row) return null

  const owner: OwnerScope = {
    [orgScopeBrand]: true,
    [ownerScopeBrand]: true,
    organizationId: row.organizationId,
    organizationSlug: row.organizationSlug,
    userId: agent.actingUserId,
    role: "owner",
    isStaff: row.isStaff,
    // EXEMPT, DELIBERATELY. The forced-TOTP mandate is about interactive
    // sign-in: it exists so that stealing an office account's PASSWORD is not
    // enough to open a client's book, and it is discharged by a browser the
    // person enrols from. An API key is already a second factor by construction
    // — a high-entropy secret that is not a password, cannot be phished from the
    // acting human, is revocable on its own, and dies the moment that human
    // loses `is_staff` or is deactivated (`resolveAgentScope`). Gating ingestion
    // on the acting accountant's authenticator would stop the office's own
    // unattended agent the first time somebody re-enrolled, and would buy
    // nothing an attacker holding the key does not already have.
    totpSatisfied: true,
  }
  return Object.freeze(owner)
}
