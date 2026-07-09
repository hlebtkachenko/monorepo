/** Obligation name with the "conditional (only if the event occurred)" marker + note. */
export function ObligationTitle({
  obligation,
  conditional,
  note,
}: {
  obligation: string
  conditional: boolean
  note?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">
        {obligation}
        {conditional ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · conditional
          </span>
        ) : null}
      </span>
      {conditional && note ? (
        <span className="text-xs text-muted-foreground">{note}</span>
      ) : null}
    </div>
  )
}
