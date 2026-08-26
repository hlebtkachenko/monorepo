import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * THE BETA PORTAL'S PAGE TYPE SCALE — one place, so the modules stop
 * disagreeing.
 *
 * Each module was built by its own PR and each invented its own heading
 * classes, which left the portal with three different "page title" sizes
 * (`text-2xl` / `text-xl` / `text-lg`) and section titles that rendered at
 * `text-sm` — the SAME 14px as the form labels underneath them, and lighter
 * than the table column heads next to them. A page title that barely outranks
 * a filter label reads as no hierarchy at all, which is what it looked like.
 *
 * The scale, and the whole of it:
 *
 *   | Role                    | Token                                          |
 *   |-------------------------|------------------------------------------------|
 *   | Page title (h1)         | `font-heading text-2xl font-semibold` (24/600)  |
 *   | Section title (h2)      | `font-heading text-base font-semibold` (16/600) |
 *   | Sub-section (h3, h4)    | `font-sans text-sm font-semibold` (14/600)      |
 *   | Form label              | `text-sm font-medium` (14/500) — `<Label>`      |
 *   | Body + helper text      | `text-sm text-muted-foreground` (14/400)        |
 *
 * Two rules make it hold together:
 *
 *   1. EVERY STEP CHANGES SIZE OR WEIGHT, never nothing. 24 → 16 → 14/600 →
 *      14/500 → 14/400. A heading always outranks the label beneath it.
 *   2. `font-heading` (Roobert) ONLY AT `text-base` AND ABOVE. The portal
 *      carries two families — Roobert for headings, Inter for everything else
 *      — and at 14px a family swap next to 14px Inter body copy is not read as
 *      hierarchy, it is read as a mistake. Below `text-base`, headings earn
 *      their rank with weight and stay in the body family.
 *
 *      That rule needs `font-sans` stated EXPLICITLY on those headings, not
 *      merely the absence of `font-heading`. `globals.css`'s base layer puts
 *      `font-heading` on every bare `h1`-`h4` (its heading rules are written
 *      for prose — hence `scroll-m-20` and the `mt-*` ladder), so omitting the
 *      class changes nothing and the sub-heading silently renders in Roobert
 *      anyway. `<h3 class="font-sans text-sm font-semibold">` is the whole
 *      opt-out.
 *
 * `mt-0` on the title is load-bearing: `globals.css`'s base layer gives every
 * bare `h1` a `mt-10` (`h2` `mt-8`), cancelled only by `first:mt-0`. A title
 * that stops being its parent's first child would otherwise silently grow 40px
 * of dead space above it.
 */

export function PageHeader({
  title,
  intro,
  actions,
  className,
}: {
  title: ReactNode
  /** The one-line explanation under the title. Omitted where there is none. */
  intro?: ReactNode
  /**
   * Trailing content on the title's own row — a freshness stamp, a period
   * picker. Baseline-aligned to the title rather than centred, so a small
   * caption sits on the same line the title sits on.
   */
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("grid gap-1", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="mt-0 font-heading text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {actions}
      </div>
      {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
    </header>
  )
}

export function SectionTitle({
  children,
  id,
  className,
}: {
  children: ReactNode
  /** For the `aria-labelledby` of the section this titles. */
  id?: string
  className?: string
}) {
  return (
    <h2
      id={id}
      className={cn("mt-0 font-heading text-base font-semibold", className)}
    >
      {children}
    </h2>
  )
}
