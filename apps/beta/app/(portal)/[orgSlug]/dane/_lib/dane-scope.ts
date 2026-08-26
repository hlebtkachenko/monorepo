import { cache } from "react"

import type { BetaFilingFamily } from "@/db/schema"
import { visibleFilingFamiliesForScope } from "@/lib/data/filings"

import { resolveOrgScope } from "../../_lib/org-scope"

/**
 * Per-request memoized DPH-gate resolution for the whole `dane` tree (spec
 * §2.3).
 *
 * The layout (which renders the family tab row) and each family page (which
 * must 404 for a family the tab row would not have shown) both need the SAME
 * visible-family list for the SAME request. `resolveOrgScope` is already
 * `cache()`-wrapped per request (`[orgSlug]/_lib/org-scope.ts`); wrapping
 * this on top means both callers share the one extra query the request
 * actually needs, the same way `page.tsx` and the org layout already share
 * `resolveOrgScope` itself.
 */
export const resolveVisibleFilingFamilies = cache(
  async (orgSlug: string): Promise<BetaFilingFamily[]> => {
    const scope = await resolveOrgScope(orgSlug)
    return visibleFilingFamiliesForScope(scope)
  },
)
