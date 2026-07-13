import { Empty, EmptyTitle } from "@workspace/ui/components/empty"

import { type SectionDescriptor, defineSection } from "./section"

export interface SectionEmptyProps {
  readonly title?: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
}

/** The sole constructor for an Empty-section descriptor. */
export function sectionEmpty(
  props?: SectionEmptyProps,
): SectionDescriptor<"empty", SectionEmptyProps> {
  const { anchor, ...rest } = props ?? {}
  // Empty fills the body so a blank page centres it full-height.
  return defineSection("empty", rest, { anchor, fill: true })
}

/**
 * SectionEmpty — a full-height centred placeholder Section. The harness that
 * proves the Section rulebook composes inside a Content-Panel body (Doc-01 §6).
 * Real sections (Form, Table, …) are deferred.
 */
export function SectionEmptyRenderer({ props }: { props: SectionEmptyProps }) {
  return (
    <Empty className="h-full min-h-[12rem]">
      <EmptyTitle>{props.title ?? "Section placeholder"}</EmptyTitle>
    </Empty>
  )
}
