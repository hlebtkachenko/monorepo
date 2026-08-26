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
