/**
 * permissions-drain lane — consumes packages/db permissions_outbox rows
 * and writes OpenFGA tuples (ADR-0018 L2).
 *
 * Drain pattern:
 *   1. SELECT … FOR UPDATE SKIP LOCKED N rows where processed_at IS NULL.
 *   2. Transform payload jsonb -> OpenFGA tuple write/delete.
 *   3. Call OpenFGA SDK Write API.
 *   4. UPDATE processed_at = now() on success; bump attempts + last_error
 *      on failure.
 *
 * permissions_outbox is ADMIN-SCOPE (no RLS). Drain reads across all orgs
 * via withAdminBypass — bypasses workspace-rls/require-with-organization
 * ESLint rule by design (see ./permissions-drain.ts:applyTuple).
 *
 * Implementation lands in the OpenFGA sidecar commit. This file
 * registers the lane name + placeholder handler so the boot path is
 * exercised end-to-end before the OpenFGA SDK is wired.
 */

import { registerLane, type Lane } from "./registry"

export const PERMISSIONS_DRAIN_LANE_NAME = "permissions-drain"

const lane: Lane = {
  name: PERMISSIONS_DRAIN_LANE_NAME,
  handler: () => {
    // Real drain logic lands in the OpenFGA sidecar commit.
    // Until then: resolved no-op. The lane registration validates
    // that the boot path picks up registered lanes correctly.
    return Promise.resolve()
  },
}

registerLane(lane)
