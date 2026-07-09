import { Card, CardContent } from "@workspace/ui/components/card"

/**
 * Shared non-"ok" state rendering for the annual Closing pages — Income tax
 * (landing / DPPO / DPFO) and Year-end statements. "no accounting period"
 * and "not applicable" (wrong person type for the tax, or a non-double-entry
 * regime for statements) read identically across all of them. "no-access"
 * renders nothing here; the server page already calls `notFound()` for that
 * status before this ever mounts.
 */
export function AnnualStatusMessage({
  data,
}: {
  data:
    | { status: "no-access" }
    | { status: "no-period" }
    | { status: "not-applicable"; reason: string }
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
