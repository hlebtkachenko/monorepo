import "server-only"

import {
  listTasksForOwner,
  listTemplatesForOwner,
} from "@/lib/data/client-tasks"
import type { OwnerClientTaskDetail } from "@/lib/data/projections"
import { requireOwner } from "@/lib/data/scope"

import { resolveOrgScope } from "../../../_lib/org-scope"

/**
 * Everything Úkoly klientovi renders, behind the owner gate — mirrors
 * `zadavani/_lib/load-zadavani.ts`'s own shape, and for the same reason: the
 * gate is the thing worth a test ("a non-owner gets a 404 from this page" has
 * to be an assertion, not a convention), and a Next page component cannot be
 * invoked in a test runner without a request context. Pulling the gate and
 * the reads into a plain async function makes the page a renderer with no
 * logic left to get wrong — `load-ukoly.db.test.ts` calls THIS.
 *
 * `resolveOrgScope` is the SAME `cache()`-wrapped resolution `[orgSlug]/
 * layout.tsx` and `pro-ucetni/layout.tsx` already made for this request, so
 * the gate here costs no extra query.
 */
export async function loadUkoly(orgSlug: string): Promise<{
  orgSlug: string
  tasks: OwnerClientTaskDetail[]
  templates: OwnerClientTaskDetail[]
}> {
  const scope = await resolveOrgScope(orgSlug)
  const owner = requireOwner(scope)

  const [tasks, templates] = await Promise.all([
    listTasksForOwner(owner),
    listTemplatesForOwner(owner),
  ])

  return { orgSlug: owner.organizationSlug, tasks, templates }
}
