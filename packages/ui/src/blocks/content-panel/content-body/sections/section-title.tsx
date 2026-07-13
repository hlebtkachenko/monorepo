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
 * heading used to introduce 2+ Form sections below it.
 */
export function sectionTitle({
  anchor,
  title,
}: SectionTitleProps): SectionDescriptor<"title", { title: string }> {
  return defineSection("title", { title }, { anchor })
}

/**
 * SectionTitle — just an `h2` group heading, at the same left position and
 * padding as a Form section's title (so it lines up above the sections it
 * groups). No description, no fields.
 */
export function SectionTitleRenderer({ props }: { props: { title: string } }) {
  return (
    <div className="px-6 py-8">
      <Heading level={2}>{props.title}</Heading>
    </div>
  )
}
