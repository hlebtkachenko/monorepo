import type { ObligationApplicability } from "./data"

/** Obligation name with an explicit unresolved-applicability marker and reason. */
export function ObligationTitle({
  obligation,
  applicability,
  reason,
}: {
  obligation: string
  applicability: ObligationApplicability
  reason?: string
}) {
  const marker =
    applicability === "CONDITION_NOT_EVALUATED"
      ? "condition not evaluated"
      : applicability === "NEEDS_INPUT"
        ? "needs input"
        : null

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">
        {obligation}
        {marker ? (
          <span className="font-normal text-muted-foreground">
            {" · "}
            {marker}
          </span>
        ) : null}
      </span>
      {marker && reason ? (
        <span className="text-xs text-muted-foreground">{reason}</span>
      ) : null}
    </div>
  )
}
