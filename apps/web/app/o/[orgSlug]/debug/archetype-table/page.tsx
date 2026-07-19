import { redirect } from "next/navigation"

import { orgHref } from "@/lib/org/href"

/**
 * Debug → Archetype Table (parent). The archetype has two reference subpages —
 * Normal Table and Pivot Table — so the bare route just redirects to the Normal
 * Table. Both subpages carry the dev/allowlist gate themselves.
 */
export default async function DebugArchetypeTablePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(orgHref(orgSlug, "debug/archetype-table/normal-table"))
}
