/**
 * The root `/` routing decision (spec `40-beta-structure.md` §2.0).
 *
 * PURE MODULE — no database, no `server-only`, no `MembershipSummary` import.
 * It takes exactly the three primitives the decision depends on rather than
 * the full projection, so the branching itself is testable in isolation from
 * `lib/data/memberships.ts`'s DB round trip and stays a compile-time-obvious
 * total function over "how many active memberships, which slug is first if
 * there is exactly one, is the viewer office staff".
 *
 *   - exactly one active membership → redirect straight to it (no picker for
 *     a viewer who only has one book to open).
 *   - more than one → the "Vaše firmy" picker.
 *   - zero → a Czech empty state. Office staff with zero memberships get a
 *     link into /admin alongside it (they are not stuck: /admin is where
 *     they provision the very memberships this page is missing); anyone else
 *     gets the plain empty state only.
 */
export type RootRoutingDecision =
  | { kind: "redirect"; slug: string }
  | { kind: "picker" }
  | { kind: "empty"; staffLink: boolean }

export function rootRoutingDecision(input: {
  membershipCount: number
  firstSlug: string | undefined
  isStaff: boolean
}): RootRoutingDecision {
  if (input.membershipCount === 1 && input.firstSlug !== undefined) {
    return { kind: "redirect", slug: input.firstSlug }
  }
  if (input.membershipCount > 1) {
    return { kind: "picker" }
  }
  return { kind: "empty", staffLink: input.isStaff }
}
