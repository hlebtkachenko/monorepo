import Link from "next/link"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Card, CardContent } from "@workspace/ui/components/card"
import { AlertTriangle } from "@workspace/ui/lib/icons"

import type { ClosingObligationsResult } from "../_lib/closing-shared"

/**
 * Shared non-"ok" state rendering for the Closing Overview + Calendar pages —
 * "no accounting period" and "VAT filing period not configured" read
 * identically on both surfaces. "no-access" renders nothing here; the server
 * page already calls `notFound()` for that status before this ever mounts.
 */
export function ClosingStatusMessage({
  slug,
  data,
}: {
  slug: string
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
  if (data.status === "vat-unconfigured") {
    return (
      <Alert>
        <AlertTriangle />
        <AlertTitle>VAT filing period not configured</AlertTitle>
        <AlertDescription>
          This company is a VAT payer but has no filing period on record, so
          statutory obligations cannot be computed.{" "}
          <Link href={`/${slug}/settings/vat-status`}>
            Set this company&apos;s VAT filing period in Settings → VAT status.
          </Link>
        </AlertDescription>
      </Alert>
    )
  }
  return null
}
