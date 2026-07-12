import * as React from "react"

export interface DetailFieldProps {
  /** The field name (e.g. "Partner"). */
  label: React.ReactNode
  /** The field value — text, a number, a badge, anything. */
  value: React.ReactNode
}

/**
 * One label/value row for an inspector or single-record (detail) view — a
 * `<dt>` / `<dd>` pair. The repeated unit of any record detail; render several
 * inside a `<dl>`. Lives with the content panel because the Inspector and the
 * "Single" content variant are its main homes.
 */
export function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}
