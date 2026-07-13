import type { ReactNode } from "react"

import { Heading } from "@workspace/ui/components/heading"

import {
  type LeafSectionDescriptor,
  type SectionDescriptor,
  defineSection,
} from "./section"

export interface SectionGroupProps {
  /** Optional group heading (`h2`), shown above the nested sections. */
  readonly title?: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /**
   * The sections placed inside this group (Form, Tabs, Space, …). Leaf sections
   * only — a group cannot nest another group (one level deep).
   */
  readonly sections: readonly LeafSectionDescriptor[]
}

export interface SectionGroupPayload {
  readonly title?: string
  readonly sections: readonly LeafSectionDescriptor[]
}

/**
 * The sole constructor for a Group-section descriptor — a titled, rule-bracketed
 * container for other sections. The group owns its chrome (top + bottom hairline
 * rules + the heading); its children are ordinary sections placed inside it.
 * Grouping is optional — a page's top-level list may hold bare sections too.
 */
export function sectionGroup({
  anchor,
  title,
  sections,
}: SectionGroupProps): SectionDescriptor<"group", SectionGroupPayload> {
  return defineSection("group", { title, sections }, { anchor })
}

/**
 * GroupFrame — the Group's presentational chrome: a full-ContentBody-width rule
 * top and bottom, and an optional `h2` heading. Purely presentational; the
 * nested sections are rendered by `SectionList` and passed in as `children`, so
 * this imports nothing from the registry (no cycle).
 */
export function GroupFrame({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    // `pb-4` gives the group's last child 16px of breathing room before the
    // bottom rule (the child keeps its own padding on top of this).
    <div className="border-t border-b border-border-subtle pb-4">
      {title != null ? (
        <div className="px-6 pt-8 pb-4">
          <Heading level={2}>{title}</Heading>
        </div>
      ) : null}
      {children}
    </div>
  )
}
