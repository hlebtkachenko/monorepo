"use client"

import { cn } from "@workspace/ui/lib/utils"

import { SectionList } from "./sections/section-list"
import type { SectionDescriptor } from "./sections/section"

export interface ContentBodyProps {
  /**
   * The ordered Sections this body renders, top to bottom. Each entry is branded
   * plain data from a `sections/*` factory (e.g. `sectionEmpty(...)`) — never
   * bespoke JSX. An Archetype composes the whole Content Panel and hands
   * ContentBody the sections that sit in its body; a single section fills the
   * height. There is deliberately NO `children` prop — a JSX-typed slot would NOT
   * enforce this (TSX widens element prop types); only a branded plain-data value
   * does. Page-specific behaviour is expressed AS DATA inside `props`
   * (action ids, hrefs, values), dispatched by the closed section renderer —
   * never as a callback or node smuggled through `props`.
   */
  sections: readonly SectionDescriptor[]
  /** Extra classes for the body region. Sections own their own inner padding. */
  className?: string
}

/**
 * ContentBody — the body region of the Content Panel. It is the scroll container
 * and delegates rendering to `SectionList`, which renders each branded `Section`
 * descriptor (recursing into `group` children). Enforcement layers: compile-time
 * brand (the descriptor type), a dev runtime assert (+ prod no-leak backstop) run
 * at every list level by SectionList, and the `check-archetype-body` CI ratchet
 * over the legacy `children` path on ContentPanel. No path accepts bespoke JSX.
 */
export function ContentBody({ sections, className }: ContentBodyProps) {
  return (
    <div
      data-slot="content-body"
      // The body itself scrolls; sections take their natural height unless a
      // `fill` section (Empty) claims the remaining space.
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto",
        className,
      )}
    >
      <SectionList sections={sections} />
    </div>
  )
}
