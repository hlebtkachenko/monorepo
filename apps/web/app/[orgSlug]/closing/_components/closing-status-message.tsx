import { Card, CardContent } from "@workspace/ui/components/card"

import type { ClosingObligationsResult } from "../_lib/closing-shared"

/**
 * Shared non-"ok" state rendering for the Closing Overview + Calendar pages —
 * "no accounting period" reads identically on both surfaces. "no-access"
 * renders nothing here; the server page already calls `notFound()` for that
 * status before this ever mounts.
 */
export function ClosingStatusMessage({
  data,
}: {
  data: Exclude<ClosingObligationsResult, { status: "ok" }>
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
  return null
}
