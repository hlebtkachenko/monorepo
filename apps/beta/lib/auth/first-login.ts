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
 *   - employee seat: §2.0.1 says "straight to `/[orgSlug]/mzdy/vyplatnice`".
 *     THIS FUNCTION SENDS THEM TO `/[orgSlug]/mzdy/moje-mzda` INSTEAD, and the
 *     deviation is deliberate and worth stating, because it is a literal
 *     departure from a spec line.
 *
 *     §2.0.1 was written before §2.6.1 resolved the seat's design. §2.6.1 —
 *     the later, explicitly "resolved" section — names the seat's three pages
 *     as "Přehled (personal), Dokumenty (own uploads + podklady), **Moje mzda**
 *     (own lines + payslips)". `vyplatnice` is the OFFICE's payslip surface
 *     (every employee's payslips, plus the bulk ZIP upload), which an employee
 *     seat gets a 404 on — sending them there would be sending them to a dead
 *     end. Moje mzda is the page §2.0.1's sentence describes ("straight to
 *     their payslips"), under the name §2.6.1 gives it.
 *
 *     A SEAT INVITE ALWAYS GRANTS `guest` (migration 0019 pins the shape), so
 *     the flag is checked before the role branches below rather than as a
 *     fourth arm of them.
 *
 * `password_reset` and an org-less `account_setup` (office provisions an
 * identity with no membership yet) both pass `organizationSlug: null`
 * (`granted_role` is NULL there too, by the `user_setup_token` CHECK), and
 * fall through to `/` — exactly root routing's job to resolve.
 */
export function firstLoginPath(input: {
  organizationSlug: string | null
  grantedRole: BetaOrgRole | null
  /** The consume bound a `payroll_employee` row (spec §2.6.1). */
  employeeSeat?: boolean
}): string {
  if (input.organizationSlug === null || input.grantedRole === null) {
    return "/"
  }
  if (input.employeeSeat === true) {
    return `/${input.organizationSlug}${EMPLOYEE_SEAT_HOME}`
  }
  if (input.grantedRole === "owner") {
    return "/"
  }
  return `/${input.organizationSlug}`
}

/**
 * The employee seat's landing page, relative to the org root.
 *
 * A CONSTANT, so the route segment is written once. It is also the answer the
 * seat's rail gives for "Moje mzda" (`app/_nav/beta-nav.ts`) and what
 * `mzdy/page.tsx` would have to redirect to — three places that must not
 * disagree about where an employee's own payroll lives.
 */
export const EMPLOYEE_SEAT_HOME = "/mzdy/moje-mzda"
