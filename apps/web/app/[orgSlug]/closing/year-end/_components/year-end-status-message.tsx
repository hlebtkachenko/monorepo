import { Card, CardContent } from "@workspace/ui/components/card"

import type { YearEndBaseStatus } from "../_lib/year-end-data"

/**
 * Shared non-"ok" state rendering for the Closing Year-end > Statements
 * page — "no accounting period" and "not applicable" (non-double-entry
 * regime) read identically. "no-access" renders nothing here; the server
 * page already calls `notFound()` for that status before this ever mounts.
 */
export function YearEndStatusMessage({
  data,
}: {
  data: YearEndBaseStatus | { status: "not-applicable"; reason: string }
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
