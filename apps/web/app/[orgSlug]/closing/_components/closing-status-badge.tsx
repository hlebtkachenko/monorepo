import { Badge } from "@workspace/ui/components/badge"

import type { ClosingObligationStatus } from "../_lib/closing-shared"

const VARIANT: Record<
  ClosingObligationStatus,
  "destructive" | "default" | "secondary"
> = {
  Overdue: "destructive",
  "Due soon": "default",
  Upcoming: "secondary",
}

/** Shared Overview/Calendar status pill — one color mapping, no drift between pages. */
export function ClosingStatusBadge({
  status,
}: {
  status: ClosingObligationStatus
}) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>
}
