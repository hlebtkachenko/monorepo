import type { BetaOrgRole } from "@/db/schema"

/**
 * Where a just-consumed setup link sends its holder (spec `40-beta-structure.md`
 * §2.0.1, "First login per role").
 *
 * PURE MODULE — no database, no `server-only`. It takes exactly the two facts
 * `consumeSetupToken`'s result already carries (the granted organization's
 * slug and the granted role), never a raw request value, so the caller in
 * `app/(auth)/_actions/consume.ts` cannot be tricked into an open redirect —
 * the string this returns is built entirely from what the DATABASE granted,
 * never from anything the POST body said.
 *
 * THE FOUR CASES THE SPEC NAMES, mapped onto what THIS build actually has:
 *
 *   - owner (Účetní): "setup link → password → forced TOTP → `/`." TOTP is not
 *     built yet (no placeholder for it either — repo rule), so this returns
 *     the un-gated root. Root routing (`root-routing.ts`) then does the right
 *     thing on its own: an owner is usually staff with several books, so `/`
 *     is the picker; a first-ever owner with exactly one grant lands straight
 *     in it via the redirect arm.
 *   - admin / member: "setup link → password → `/[orgSlug]`" — direct into
 *     the org, skipping the picker. The dismissible 3-card intro the spec
 *     also names is Přehled UI polish, not a routing decision; it ships with
 *     the rest of Přehled in PR 20 (this PR's Přehled is deliberately the
 *     minimal, placeholder-free shell only).
 *   - guest: "straight in" — same direct-to-org treatment as admin/member.
 *     Guest's narrower content (no upload affordances) is a page-level
 *     concern, not a routing one.
 *   - employee seat: "straight to `/[orgSlug]/mzdy/vyplatnice`" — UNREACHABLE
 *     from this function today. An employee seat is a `guest` membership
 *     linked to a `payroll_employee` row, and that table does not exist until
 *     PR 29+; there is no data to distinguish it from an ordinary guest yet.
 *     A `guest` grant lands at the org home like every other non-owner role,
 *     which is the only page an employee seat is guaranteed to have (no dead
 *     link to a Mzdy module that isn't built). Extending this function to a
 *     third argument (a payroll-employee flag) is the natural PR 32 change.
 *
 * `password_reset` and an org-less `account_setup` (office provisions an
 * identity with no membership yet) both pass `organizationSlug: null`
 * (`granted_role` is NULL there too, by the `user_setup_token` CHECK), and
 * fall through to `/` — exactly root routing's job to resolve.
 */
export function firstLoginPath(input: {
  organizationSlug: string | null
  grantedRole: BetaOrgRole | null
}): string {
  if (input.organizationSlug === null || input.grantedRole === null) {
    return "/"
  }
  if (input.grantedRole === "owner") {
    return "/"
  }
  return `/${input.organizationSlug}`
}
