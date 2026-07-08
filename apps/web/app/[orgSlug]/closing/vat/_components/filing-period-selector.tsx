import Link from "next/link"

import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import type { VatFilingPeriodOption } from "../_lib/vat-data"

/**
 * Filing-period picker — a row of `Link`s (not client state) that set the
 * page's `?fp=<from>` search param, so the server re-renders with the chosen
 * period. No client JS, no second round-trip fetch.
 */
export function FilingPeriodSelector({
  basePath,
  filingPeriods,
  selectedFrom,
}: {
  basePath: string
  filingPeriods: VatFilingPeriodOption[]
  selectedFrom: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {filingPeriods.map((fp) => (
        <Link
          key={fp.from}
          href={`${basePath}?fp=${fp.from}`}
          className={cn(
            buttonVariants({
              variant: fp.from === selectedFrom ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          {fp.label}
        </Link>
      ))}
    </div>
  )
}
