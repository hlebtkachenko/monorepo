"use client"

// Shared form primitives for the /fakturace sections: a visually-bounded
// <Section> card (the "each part separated" requirement) plus labeled text /
// number / textarea inputs. Screen-only chrome — the whole editor is marked
// .no-print so it never lands on the printed documents.

import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

export const INPUT_CLASS =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"

const LABEL_CLASS = "text-xs font-medium text-neutral-600"

/** A bounded, anchor-linkable section of the editor. */
export function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className="no-print scroll-mt-20 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
          {description ? (
            <p className="text-xs text-neutral-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  className,
  type = "text",
  inputMode,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: "text" | "date" | "email" | "tel"
  inputMode?: "text" | "numeric"
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className={LABEL_CLASS}>{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
    </label>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  className,
  step,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
  step?: string
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className={LABEL_CLASS}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        value={Number.isFinite(value) ? value : 0}
        placeholder={placeholder}
        onChange={(e) => {
          const n = e.target.valueAsNumber
          onChange(Number.isFinite(n) ? n : 0)
        }}
        className={cn(INPUT_CLASS, "text-right")}
      />
    </label>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  className,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className={LABEL_CLASS}>{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLASS, "resize-y")}
      />
    </label>
  )
}
