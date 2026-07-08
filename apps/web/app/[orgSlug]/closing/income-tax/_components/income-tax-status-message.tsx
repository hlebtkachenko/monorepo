import { Card, CardContent } from "@workspace/ui/components/card"

import type { IncomeTaxBaseStatus } from "../_lib/income-tax-data"

/**
 * Shared non-"ok" state rendering for the Closing Income tax pages (landing
 * / DPPO / DPFO) — "no accounting period" and "not applicable" (wrong
 * person type for this tax) read identically everywhere. "no-access"
 * renders nothing here; the server page already calls `notFound()` for
 * that status before this ever mounts.
 */
export function IncomeTaxStatusMessage({
  data,
}: {
  data: IncomeTaxBaseStatus | { status: "not-applicable"; reason: string }
}) {
  if (data.status === "no-period") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No accounting period yet.
        </CardContent>
      </Card>
    )
  }
  if (data.status === "not-applicable") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {data.reason}
        </CardContent>
      </Card>
    )
  }
  return null
}
