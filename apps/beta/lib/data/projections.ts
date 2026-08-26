/**
 * Client projections — the column allowlists for everything that crosses from
 * the database into a rendered page or a client component.
 *
 * WHY THIS MODULE EXISTS. Beta has no RLS (plan Part 4): the outer wall is the
 * dedicated database, the inner wall is the scope seam in `scope.ts`. Neither
 * wall says anything about WHICH COLUMNS of a row a browser gets to see, and a
 * row read inside the right organization can still carry columns that belong to
 * the office alone. `app_user.is_staff` is the precondition for an owner
 * membership, `app_user.disabled_at` is the offboarding switch, and
 * `user_setup_token` is nothing but secrets. None of them has a client-side use.
 *
 * THE RULE. A DB row is never spread into a client-visible object. Every one of
 * these helpers is an explicit `pick`: the returned object literal names each
 * field, so a column added to a table later is invisible here until someone
 * deliberately adds it — the opposite of `{ ...row }`, which would ship it the
 * day it is created.
 *
 * This module is deliberately PURE — no `server-only`, no runtime import of the
 * Drizzle schema (the table imports are `import type`, erased at compile time).
 * A client component may therefore import these TYPES without dragging the
 * database layer into its bundle.
 */
import type {
  app_user,
  organization,
  organization_membership,
  BetaSetupTokenPurpose,
} from "@/db/schema"

type AppUserRow = typeof app_user.$inferSelect
type OrganizationRow = typeof organization.$inferSelect
type MembershipRow = typeof organization_membership.$inferSelect

/**
 * Columns that must never appear in a client-visible object, in any spelling.
 *
 * The comparison in `forbiddenClientKeys` is done on a normalized form
 * (lowercased, separators stripped), so `is_staff`, `isStaff` and `IsStaff` are
 * all the same name here: a projection cannot smuggle a forbidden column past
 * the check by renaming it to camelCase on the way out.
 */
export const CLIENT_FORBIDDEN_COLUMNS = Object.freeze([
  // app_user — office-internal identity state.
  "is_staff",
  "disabled_at",
  "email_verified",
  "two_factor_enabled",
  // user_setup_token — the link secret and its forensics.
  "token_hash",
  "issued_by_user_id",
  "issued_ip",
  "consumed_ip",
  "consumed_user_agent",
  "consumed_user_id",
  "revoked_at",
  "granted_role",
])

const normalize = (key: string): string =>
  key.replace(/[_-]/g, "").toLowerCase()

const FORBIDDEN_NORMALIZED = new Set(CLIENT_FORBIDDEN_COLUMNS.map(normalize))

/**
 * Every forbidden column name reachable from `value`, recursively. Returns the
 * offending keys rather than a boolean so a failing test names the leak.
 */
export function forbiddenClientKeys(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || typeof value !== "object") return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => forbiddenClientKeys(item, depth + 1))
  }
  const found: string[] = []
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_NORMALIZED.has(normalize(key))) found.push(key)
    found.push(...forbiddenClientKeys(nested, depth + 1))
  }
  return found
}

// ---------------------------------------------------------------------------
// Viewer — the signed-in identity itself
// ---------------------------------------------------------------------------

/**
 * The signed-in user as the browser is allowed to know them. This is also the
 * shape `getBetaSession()` returns, so the session object a page holds IS the
 * projection — there is no unprojected user row anywhere above the data layer.
 */
export type ViewerProfile = {
  userId: string
  email: string
  name: string
}

export function viewerProfile(
  row: Pick<AppUserRow, "id" | "email" | "name">,
): ViewerProfile {
  return { userId: row.id, email: row.email, name: row.name }
}

// ---------------------------------------------------------------------------
// Organization — the client book
// ---------------------------------------------------------------------------

/**
 * The organization as every org-scoped surface (header, switcher, dashboard)
 * needs it. Deliberately NOT the identity card: sídlo, bank details and the
 * ARES stamp are a separate, larger projection that lands with Nastavení ›
 * Společnost (PR 21) and is read by fewer pages.
 *
 * `archived_at` is absent by design. An archived organization never resolves a
 * scope at all (`requireScope`), so a page holding this object is by
 * construction looking at a live book and has no state to branch on.
 */
export type OrganizationSummary = {
  id: string
  slug: string
  legalName: string
  vatRegime: OrganizationRow["vat_regime"]
  vatRegisteredFrom: string | null
  isDemo: boolean
}

export function organizationSummary(
  row: Pick<
    OrganizationRow,
    | "id"
    | "slug"
    | "legal_name"
    | "vat_regime"
    | "vat_registered_from"
    | "is_demo"
  >,
): OrganizationSummary {
  return {
    id: row.id,
    slug: row.slug,
    legalName: row.legal_name,
    vatRegime: row.vat_regime,
    vatRegisteredFrom: row.vat_registered_from,
    isDemo: row.is_demo,
  }
}

// ---------------------------------------------------------------------------
// Membership — a person in an organization's people list
// ---------------------------------------------------------------------------

/**
 * One row of Nastavení › Lidé (spec §2.10), which is the people-management
 * surface admins use. It joins `organization_membership` to `app_user`, and
 * that join is exactly where `is_staff` and `disabled_at` would ride along:
 * a company admin must not be able to read off which of their colleagues is
 * office staff, and the office's deactivation timestamps are not their
 * business either.
 *
 * The DISPLAY label (Účetní / Majitel společnosti / Pracovník firmy (vedení) /
 * Host) is derived from `role` in the UI layer, not stored here.
 */
export type OrgMemberSummary = {
  userId: string
  name: string
  email: string
  role: MembershipRow["role"]
  active: boolean
}

export function orgMemberSummary(
  row: Pick<AppUserRow, "email" | "name"> & {
    user_id: MembershipRow["user_id"]
    role: MembershipRow["role"]
    active: MembershipRow["active"]
  },
): OrgMemberSummary {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
  }
}

// ---------------------------------------------------------------------------
// Setup link — the one-time-link screens
// ---------------------------------------------------------------------------

/**
 * What a one-time link screen may render before anyone is authenticated
 * (`peekSetupToken`). Three fields, and every other column of
 * `user_setup_token` is a secret or a forensic record: the hash of the link,
 * the issuer, the IPs, the granted role.
 *
 * `organizationName` is an organization column reaching an unauthenticated
 * page, which is safe only because the visitor already holds the link that
 * names it — and it is precisely why this is a projection rather than a row.
 */
export type SetupInviteView = {
  purpose: BetaSetupTokenPurpose
  email: string
  organizationName: string | null
}

export function setupInviteView(row: {
  purpose: SetupInviteView["purpose"]
  email: string
  organizationName: string | null
}): SetupInviteView {
  return {
    purpose: row.purpose,
    email: row.email,
    organizationName: row.organizationName,
  }
}

// ---------------------------------------------------------------------------
// Office tier — the /admin surface
// ---------------------------------------------------------------------------

/**
 * /admin is above organizations and is reached only through `requireOffice()`,
 * so it legitimately renders facts the client tier above must never see: who is
 * office staff, who has been deactivated, what role a pending invite grants.
 *
 * THESE PROJECTIONS STILL PASS `forbiddenClientKeys`, AND THAT IS DELIBERATE —
 * not a loophole. The forbidden list is a list of RAW COLUMN NAMES: its job is
 * to catch a row that reached a component by being spread, which is how a
 * privileged column ships without anyone deciding to ship it. An office
 * projection that has decided to expose staff-ness says `staff: boolean`, a
 * derived fact with a chosen name and a chosen meaning; a `is_staff` key
 * appearing here would mean the row came through unpicked, which is the thing
 * being checked for. Same for `disabled` vs `disabled_at`, `role` vs
 * `granted_role`, and `status` vs the three timestamp columns behind it.
 *
 * What is absent from EVERY shape below, at every tier: `token_hash`. The
 * registry cannot render a link because it has no field for one — the raw
 * secret exists once, in `issueSetupToken`'s return value, and never again.
 */

export type OfficeOrganizationRow = {
  id: string
  slug: string
  legalName: string
  ico: string | null
  vatRegime: OrganizationRow["vat_regime"]
  /**
   * Load-bearing, not decorative. The /admin settings form posts the VAT regime
   * and its registration date TOGETHER (`organizationVatPayload` keeps the pair
   * coherent), so the date input has to be able to render the stored value as
   * its `defaultValue`. Without this field the input renders empty, every save
   * posts an empty date, and an unrelated edit — toggling `is_demo` — silently
   * nulls the registration date of a plátce.
   */
  vatRegisteredFrom: string | null
  isDemo: boolean
  archived: boolean
  /** Active memberships, and how many of them are owners (the ≥1 invariant). */
  memberCount: number
  ownerCount: number
}

export function officeOrganizationRow(row: {
  id: string
  slug: string
  legal_name: string
  ico: string | null
  vat_regime: OrganizationRow["vat_regime"]
  vat_registered_from: string | null
  is_demo: boolean
  archived_at: Date | null
  memberCount: number
  ownerCount: number
}): OfficeOrganizationRow {
  return {
    id: row.id,
    slug: row.slug,
    legalName: row.legal_name,
    ico: row.ico,
    vatRegime: row.vat_regime,
    vatRegisteredFrom: row.vat_registered_from,
    isDemo: row.is_demo,
    archived: row.archived_at !== null,
    memberCount: row.memberCount,
    ownerCount: row.ownerCount,
  }
}

/** One person in an organization, as the office sees them. */
export type OfficeMemberRow = {
  userId: string
  name: string
  email: string
  role: MembershipRow["role"]
  active: boolean
  /** Office staff. The precondition for `owner`, so the grid has to show it. */
  staff: boolean
  /** The account itself is deactivated — outranks the membership's own state. */
  disabled: boolean
}

export function officeMemberRow(row: {
  user_id: string
  name: string
  email: string
  role: MembershipRow["role"]
  active: boolean
  is_staff: boolean
  disabled_at: Date | null
}): OfficeMemberRow {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    staff: row.is_staff,
    disabled: row.disabled_at !== null,
  }
}

/** One account in the cross-org user list. */
export type OfficeUserRow = {
  userId: string
  name: string
  email: string
  staff: boolean
  disabled: boolean
  /** Whether a credential exists — a provisioned account has none yet. */
  activated: boolean
  /** Active memberships, so deactivation is never a blind action. */
  membershipCount: number
  ownerOfCount: number
}

export function officeUserRow(row: {
  id: string
  name: string
  email: string
  is_staff: boolean
  disabled_at: Date | null
  activated: boolean
  membershipCount: number
  ownerOfCount: number
}): OfficeUserRow {
  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    staff: row.is_staff,
    disabled: row.disabled_at !== null,
    activated: row.activated,
    membershipCount: row.membershipCount,
    ownerOfCount: row.ownerOfCount,
  }
}

/**
 * The four states a link can be in, collapsed from three nullable timestamps
 * into one value the registry can filter on. `consumed` outranks `revoked`
 * because the sibling sweep revokes the OTHER links when one is consumed, and a
 * link that was actually used is the more important fact about it; both outrank
 * `expired`, which is only about the clock.
 */
export type SetupLinkStatus = "live" | "consumed" | "revoked" | "expired"

function setupLinkStatus(
  row: {
    consumedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
  },
  now: Date = new Date(),
): SetupLinkStatus {
  if (row.consumedAt !== null) return "consumed"
  if (row.revokedAt !== null) return "revoked"
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "live"
}

/** One row of the /admin setup-link registry. Carries no secret of any kind. */
export type OfficeSetupLinkRow = {
  id: string
  purpose: BetaSetupTokenPurpose
  email: string
  organizationName: string | null
  /** The role the link grants, absent for an unscoped one. */
  role: MembershipRow["role"] | null
  status: SetupLinkStatus
  expiresAt: string
  createdAt: string
  issuedByEmail: string | null
}

export function officeSetupLinkRow(
  row: {
    id: string
    purpose: BetaSetupTokenPurpose
    email: string
    organizationName: string | null
    grantedRole: MembershipRow["role"] | null
    consumedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
    createdAt: Date
    issuedByEmail: string | null
  },
  now?: Date,
): OfficeSetupLinkRow {
  return {
    id: row.id,
    purpose: row.purpose,
    email: row.email,
    organizationName: row.organizationName,
    role: row.grantedRole,
    status: setupLinkStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    issuedByEmail: row.issuedByEmail,
  }
}
