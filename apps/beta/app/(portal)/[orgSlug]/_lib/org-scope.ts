import { cache } from "react"

import { requireScope, type OrgScope } from "@/lib/data/scope"

/**
 * Per-request memoized scope resolution for the `[orgSlug]` tree.
 *
 * `requireScope` re-reads the database on every call (a deliberate seam
 * property — see its own header comment on "fail-closed on its own terms").
 * The org layout and every org page beneath it need the SAME scope for the
 * SAME request, so calling `requireScope` directly from each would resolve it
 * twice — this collapses that into the one DB round trip the request
 * actually needs, mirroring apps/web's `resolveLayoutMembership`
 * (`apps/web/app/o/[orgSlug]/layout.tsx`). React's `cache()` keys purely on
 * the primitive `orgSlug` argument (the session itself is implicit request
 * context, read inside `requireScope`), and the memoization only lives for
 * one request — a different request never sees a stale scope.
 */
export const resolveOrgScope = cache((orgSlug: string): Promise<OrgScope> =>
  requireScope(orgSlug),
)
