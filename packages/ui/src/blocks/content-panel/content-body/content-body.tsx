"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import {
  type ArchetypeDescriptor,
  isArchetypeDescriptor,
} from "./archetypes/archetype"
import { ARCHETYPE_REGISTRY } from "./archetypes/registry"

export interface ContentBodyProps {
  /**
   * The ONE archetype to render. Branded data from an `archetypes/*` factory
   * (e.g. `archetypeEmpty({...})`). There is deliberately NO `children` prop —
   * the body cannot hold bespoke JSX. A JSX-typed slot would NOT enforce this
   * (TSX widens element prop types); only a branded plain-data value does.
   */
  body: ArchetypeDescriptor
  /** Extra classes for the scrolling body region. */
  className?: string
}

/**
 * ContentBody — the archetype-blocked scrolling body of the Content Panel. It
 * accepts only a branded `ArchetypeDescriptor` (from a closed factory), looks up
 * the review-gated registry renderer for `body.kind`, and renders it. Three
 * enforcement layers: compile-time brand (this prop type), dev runtime assert
 * (below), and the `check-archetype-body` CI ratchet over legacy `children`.
 */
export function ContentBody({ body, className }: ContentBodyProps) {
  if (!isArchetypeDescriptor(body)) {
    const message =
      "ContentBody: `body` must be a branded archetype descriptor from " +
      "archetypes/* (e.g. archetypeEmpty(...)). Do not cast or hand-build it."
    // Dev: fail loud. Prod: a cheap brand-read backstop against `as any`
    // forgeries — render nothing rather than white-screen or leak a hand-built body.
    if (process.env.NODE_ENV !== "production") throw new Error(message)
    console.error(message)
    return (
      <div
        data-slot="content-body"
        className={cn("min-w-0 flex-1 overflow-auto p-3", className)}
      />
    )
  }

  // The brand guarantees kind ↔ props agree at construction; cast the renderer
  // to accept the descriptor's payload (the registry types it as `never` only to
  // drive the exhaustiveness `satisfies` check).
  const Renderer = ARCHETYPE_REGISTRY[body.kind] as React.ComponentType<{
    props: unknown
  }>

  return (
    <div
      data-slot="content-body"
      className={cn("min-w-0 flex-1 overflow-auto p-3", className)}
    >
      {Renderer ? <Renderer props={body.props} /> : null}
    </div>
  )
}
