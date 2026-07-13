"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { SECTION_REGISTRY } from "./sections/registry"
import { type SectionDescriptor, isSectionDescriptor } from "./sections/section"

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
 * ContentBody — the body region of the Content Panel. It renders a list of
 * branded `Section` descriptors through the closed `SECTION_REGISTRY`.
 * Enforcement layers: compile-time brand (the descriptor type), a dev runtime
 * assert (+ prod no-leak backstop), and the `check-archetype-body` CI ratchet
 * over the legacy `children` path on ContentPanel. No path accepts bespoke JSX.
 */
export function ContentBody({ sections, className }: ContentBodyProps) {
  return (
    <div
      data-slot="content-body"
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}
    >
      {sections.map((section, index) => {
        if (!isSectionDescriptor(section)) {
          const message =
            "ContentBody: every `sections` entry must be a branded section " +
            "descriptor from sections/* (e.g. sectionEmpty(...)). Do not cast " +
            "or hand-build it."
          // Dev: fail loud. Prod: skip the forgery rather than leak it.
          if (process.env.NODE_ENV !== "production") throw new Error(message)
          console.error(message)
          return null
        }
        // The brand guarantees kind ↔ props agree; cast the `never`-typed
        // registry entry (it exists only to drive the exhaustiveness check).
        const Renderer = SECTION_REGISTRY[section.kind] as React.ComponentType<{
          props: unknown
        }>
        return (
          <div
            // Stable-ish key: sections are a fixed per-archetype list today, so
            // kind+index is unambiguous. Swap for a descriptor id if sections
            // ever become reorderable/insertable.
            key={`${section.kind}-${index}`}
            // The section-level `anchor` becomes the DOM id so URL/CLI/agent/docs
            // links can deep-link a section (`…#legal-identity`). `scroll-mt`
            // offsets the anchored scroll so it clears the content header.
            id={section.anchor}
            data-slot="content-section"
            data-section-anchor={section.anchor}
            className="flex min-h-0 flex-1 scroll-mt-16 flex-col overflow-auto"
          >
            <Renderer props={section.props} />
          </div>
        )
      })}
    </div>
  )
}
