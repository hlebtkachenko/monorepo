"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { SECTION_REGISTRY } from "./registry"
import { type SectionDescriptor, isSectionDescriptor } from "./section"
import { GroupFrame, type SectionGroupPayload } from "./section-group"

const FORGERY_MESSAGE =
  "SectionList: every `sections` entry must be a branded section descriptor " +
  "from sections/* (e.g. sectionForm(...)). Do not cast or hand-build it."

/** Renders one already-guarded section's body — a group (recursing) or a leaf. */
function SectionBody({ section }: { section: SectionDescriptor }) {
  if (section.kind === "group") {
    const payload = section.props as SectionGroupPayload
    return (
      <GroupFrame title={payload.title}>
        <SectionList sections={payload.sections} />
      </GroupFrame>
    )
  }
  // `kind` is narrowed to a leaf kind here; the registry is leaf-only. The brand
  // guarantees kind ↔ props agree; cast the `never`-typed registry entry (it
  // exists only to drive the exhaustiveness check).
  const Renderer = SECTION_REGISTRY[section.kind] as React.ComponentType<{
    props: unknown
  }>
  return <Renderer props={section.props} />
}

/**
 * SectionList — renders an ordered list of branded Section descriptors, each in
 * its own `content-section` wrapper (anchor id, scroll offset, fill/natural
 * height). Shared by `ContentBody` (top level) and `GroupFrame` (a group's
 * nested children), so the runtime brand guard runs at EVERY level. A `group`
 * recurses through this same renderer; the closed `SECTION_REGISTRY` stays
 * leaf-only (group is handled here), which keeps the registry free of a cycle.
 */
export function SectionList({
  sections,
}: {
  sections: readonly SectionDescriptor[]
}) {
  return (
    <>
      {sections.map((section, index) => {
        if (!isSectionDescriptor(section)) {
          // Dev: fail loud. Prod: skip the forgery rather than leak it.
          if (process.env.NODE_ENV !== "production")
            throw new Error(FORGERY_MESSAGE)
          console.error(FORGERY_MESSAGE)
          return null
        }
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
            className={cn(
              "flex scroll-mt-16 flex-col",
              // Fill sections (Empty) grow to the remaining height; the rest
              // take their natural height and let the body scroll.
              section.fill ? "min-h-0 flex-1" : "shrink-0",
            )}
          >
            <SectionBody section={section} />
          </div>
        )
      })}
    </>
  )
}
