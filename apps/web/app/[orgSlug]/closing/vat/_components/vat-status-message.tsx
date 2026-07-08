import Link from "next/link"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Card, CardContent } from "@workspace/ui/components/card"
import { AlertTriangle } from "@workspace/ui/lib/icons"

import type { VatBaseStatus } from "../_lib/vat-data"

/**
 * Shared non-"ok" state rendering for the Closing VAT pages (Overview / DAP /
 * KH / SH) — "no accounting period", "not a VAT payer", "identified person",
 * and "VAT filing period not configured" read identically everywhere a VAT
 * loader stops short of real figures. "no-access" renders nothing here; the
 * server page already calls `notFound()` for that status before this ever
 * mounts.
 */
export function VatStatusMessage({
  slug,
  data,
}: {
  slug: string
  data: VatBaseStatus
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
  if (data.status === "not-payer") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This company is not a VAT payer for the active period, so it has no
          VAT return, control statement, or EC sales list to file.
        </CardContent>
      </Card>
    )
  }
  if (data.status === "identified-person") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          This company is registered as an <em>identifikovaná osoba</em>{" "}
          (identified person), not a VAT payer, so it has no standing filing
          period here. It still files a VAT return / EC sales list whenever a
          taxable event or EU supply arises (§101 odst. 5 + §102 ZDPH). Check
          the <Link href={`/${slug}/closing`}>Closing Overview</Link> for any
          conditional VAT obligations currently due.
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
          This company is a VAT payer but has no filing period on record, so its
          VAT return / control statement / EC sales list cannot be computed.{" "}
          <Link href={`/${slug}/settings/vat-status`}>
            Set this company&apos;s VAT filing period in Settings → VAT status.
          </Link>
        </AlertDescription>
      </Alert>
    )
  }
  return null
}
