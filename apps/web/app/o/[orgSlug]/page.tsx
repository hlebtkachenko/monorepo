import { Badge } from "@workspace/ui/components/badge"

import { getActivePeriod } from "@/lib/org/period"
import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

/**
 * Temporary Company home for the rebuilt tree — a foundation skeleton that
 * proves the vertical slice end to end: routing → auth gate (in the layout) →
 * membership → URL-authoritative active period. Replaced by a real
 * archetype-driven page in the execution phase.
 */
export default async function OrgHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const { orgSlug } = await params
  const { period } = await searchParams

  // The layout already guarded auth + membership; re-resolve here for the org id
  // (an RSC layout can't pass resolved ids down to its pages).
  const session = await getRequestSession()
  const membership = session
    ? await resolveMembership({ slug: orgSlug, userId: session.user.id })
    : null
  const active = membership
    ? (await getActivePeriod(membership.organizationId, period ?? null)).active
    : null

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">
          {membership?.legalName ?? "Company"}
        </h1>
        <Badge variant="outline">rebuilt tree · /o</Badge>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        Foundation skeleton for the ground-up org UI rebuild. This page proves
        the slice works: the layout resolved your membership, the shell renders
        from the new nav, and the active accounting period is driven by the URL
        (<code>?period=</code>) — switch it in the header and this value
        updates.
      </p>
      <dl className="grid max-w-md grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt className="text-muted-foreground">Org slug</dt>
        <dd className="font-mono">{orgSlug}</dd>
        <dt className="text-muted-foreground">Active period</dt>
        <dd className="font-mono">
          {active
            ? `${active.period_start} – ${active.period_end} (${active.status})`
            : "none"}
        </dd>
        <dt className="text-muted-foreground">?period param</dt>
        <dd className="font-mono">{period ?? "—"}</dd>
      </dl>
    </div>
  )
}
