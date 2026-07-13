import { Heading } from "@workspace/ui/components/heading"

import { type SectionDescriptor, defineSection } from "./section"

export interface SectionTitleProps {
  /** The group heading text. */
  readonly title: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
}

/**
 * The sole constructor for a Title-section descriptor — a standalone group
 * heading used to introduce 2+ Form sections below it. Bracket a group with
 * `sectionDivider()` above/below for the rules.
 */
export function sectionTitle({
  anchor,
  title,
}: SectionTitleProps): SectionDescriptor<"title", { title: string }> {
  return defineSection("title", { title }, { anchor })
}

/**
 * SectionTitle — just an `h2` group heading, at the same left position as a Form
 * section's title (`px-6`), so it lines up above the sections it groups. `pt-8`
 * top / `pb-4` bottom (hugs its group). No description, no fields, no rule — a
 * `sectionDivider()` draws any rule the group needs.
 */
export function SectionTitleRenderer({ props }: { props: { title: string } }) {
  return (
    <div className="px-6 pt-8 pb-4">
      <Heading level={2}>{props.title}</Heading>
    </div>
  )
}
