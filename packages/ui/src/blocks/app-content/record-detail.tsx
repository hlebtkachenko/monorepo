import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { DetailField } from "./detail-field"

export interface RecordField {
  label: React.ReactNode
  value: React.ReactNode
}

export interface RecordGroup {
  /** Optional group heading (e.g. "Identification"). */
  title?: React.ReactNode
  /** The label/value rows in this group. */
  fields: RecordField[]
}

export interface RecordDetailProps {
  /**
   * The record name / headline. Optional: omit it (and the other header props)
   * when the record title/status/actions live in the content header instead —
   * then this renders as a pure field body.
   */
  title?: React.ReactNode
  /** Optional sub-line under the title (id, type, timestamp). */
  subtitle?: React.ReactNode
  /** Optional status node, shown beside the title (e.g. a `Badge`). */
  status?: React.ReactNode
  /** Optional right-aligned header actions (edit, more, …). */
  actions?: React.ReactNode
  /** Optional tabs / section switcher rendered under the header. */
  tabs?: React.ReactNode
  /** The field groups, rendered as a responsive `<dl>` per group. */
  groups: RecordGroup[]
  /** Optional side column (meta, related links, activity). */
  aside?: React.ReactNode
  className?: string
}

/**
 * Single archetype (prototype) — one record on show. A header (title + status +
 * actions), an optional tabs row, then grouped label/value fields with an
 * optional side meta column. Reuses `DetailField` for each row. Presentational;
 * drop into a `ContentPanel`'s `children`. The detail layout for a document, a
 * counterparty, a settings record.
 */
export function RecordDetail({
  title,
  subtitle,
  status,
  actions,
  tabs,
  groups,
  aside,
  className,
}: RecordDetailProps) {
  const hasHeader =
    title != null || subtitle != null || status != null || actions != null

  return (
    <div
      data-slot="record-detail"
      className={cn("mx-auto flex max-w-5xl flex-col gap-6", className)}
    >
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              {title != null ? (
                <h2 className="truncate font-heading text-xl font-semibold">
                  {title}
                </h2>
              ) : null}
              {status}
            </div>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}

      {tabs}

      <div
        className={cn(
          "grid gap-6",
          aside != null && "lg:grid-cols-[1fr_18rem]",
        )}
      >
        <div className="space-y-6">
          {groups.map((group, i) => (
            <section key={i} className="space-y-3">
              {group.title ? (
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {group.title}
                </h3>
              ) : null}
              <dl className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((field, j) => (
                  <DetailField
                    key={j}
                    label={field.label}
                    value={field.value}
                  />
                ))}
              </dl>
            </section>
          ))}
        </div>
        {aside != null ? (
          <aside className="space-y-3 rounded-xl bg-muted/40 p-4 ring-1 ring-foreground/5">
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
