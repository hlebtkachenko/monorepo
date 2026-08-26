import "server-only"

import { filingsForScope } from "@/lib/data/filings"
import { liabilitiesForScope } from "@/lib/data/liabilities"
import type { FilingView, LiabilityView } from "@/lib/data/projections"
import { requireOwner } from "@/lib/data/scope"

import { resolveOrgScope } from "../../../_lib/org-scope"

/**
 * Everything Zadávání dat renders, behind the owner gate — the page's server
 * logic, extracted so it can be tested.
 *
 * WHY THIS IS NOT INLINE IN `page.tsx`. The gate is the thing worth a test:
 * "a non-owner gets a 404 from this page" has to be an assertion, not a
 * convention, and a Next page component cannot be invoked in a test runner
 * without a request context (it resolves next-intl's catalog on the way in).
 * Pulling the gate and the reads into a plain async function makes the page a
 * renderer with no logic left to get wrong, and makes the 404 provable —
 * `page.db.test.ts` calls THIS.
 *
 * `resolveOrgScope` is the SAME `cache()`-wrapped resolution `[orgSlug]/
 * layout.tsx` and `pro-ucetni/layout.tsx` already made for this request, so the
 * gate here costs no extra query — and re-deriving the `OwnerScope` in this
 * file rather than trusting the layout's is what makes `owner` a proven handle
 * HERE, the same discipline `zpracovani/page.tsx` follows.
 *
 * PAID ROWS ARE INCLUDED. Dluhy a platby is a list of debts and hides them;
 * this is the editing surface, and an accountant who mis-keyed a payment has to
 * be able to find the row again.
 */
export async function loadZadavani(orgSlug: string): Promise<{
  orgSlug: string
  filings: FilingView[]
  liabilities: LiabilityView[]
}> {
  const scope = await resolveOrgScope(orgSlug)
  const owner = requireOwner(scope)

  const [filings, liabilities] = await Promise.all([
    filingsForScope(owner),
    liabilitiesForScope(owner, { includePaid: true }),
  ])

  return { orgSlug: owner.organizationSlug, filings, liabilities }
}
