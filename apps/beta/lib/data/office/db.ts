import "server-only"

import { notFound } from "next/navigation"

import { betaDb, type BetaDatabase } from "@/db/client"

import type { OfficeScope } from "../scope"

/**
 * The database handle for the cross-org office area, and the one place every
 * `lib/data/office/*` function starts.
 *
 * WHY IT TAKES A SCOPE IT BARELY USES. Organization-scoped functions consume
 * their handle in the WHERE clause — `eq(x.organization_id, scope.organizationId)`
 * is both the proof and the filter. Office functions have no filter: /admin is
 * above organizations, so a cross-org list is the correct answer and there is
 * nothing to narrow. What the handle still buys is the SIGNATURE: a function
 * that takes an `OfficeScope` cannot be called without one, an `OfficeScope`
 * cannot be constructed outside `scope.ts` (the brand symbol is module-private,
 * and `scope-brand-fence.boundary.test.ts` fails any file that tries to assert
 * its way to one), and the only producer is `requireOffice()`. So "is this
 * reader office staff" is answered by the type system on every one of these
 * calls, not by remembering to write a check.
 *
 * The `isStaff` re-assert is a fail-closed floor rather than a real branch — an
 * `OfficeScope` with `isStaff: false` is not constructible. It is here for the
 * same reason `requireScope` re-checks `app_user.disabled_at` even though
 * `getBetaSession` already did: this seam has to be correct on its own terms,
 * and the check costs nothing.
 */
export function officeDb(office: OfficeScope): BetaDatabase {
  if (!office.isStaff) notFound()
  return betaDb()
}
