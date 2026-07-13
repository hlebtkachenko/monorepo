import { Heading } from "@workspace/ui/components/heading"
import { cn } from "@workspace/ui/lib/utils"

import { type SectionDescriptor, defineSection } from "./section"

export interface SectionTitleProps {
  /** The group heading text. */
  readonly title: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /**
   * Draw a full-width hairline rule above the title. Set it on every group
   * heading (typically all but the first on a page) to visually separate the
   * group from what precedes it — the archetype/page owns which titles rule.
   */
  readonly topRule?: boolean
}

interface SectionTitlePayload {
  readonly title: string
  readonly topRule?: boolean
}

/**
 * The sole constructor for a Title-section descriptor — a standalone group
 * heading used to introduce 2+ Form sections below it.
 */
export function sectionTitle({
  anchor,
  title,
  topRule,
}: SectionTitleProps): SectionDescriptor<"title", SectionTitlePayload> {
  return defineSection("title", { title, topRule }, { anchor })
}

/**
 * SectionTitle — just an `h2` group heading, at the same left position as a Form
 * section's title (`px-6`), so it lines up above the sections it groups. `pt-8`
 * top / `pb-4` bottom (hugs its group). With `topRule`, a full-ContentBody-width
 * hairline sits above it. No description, no fields.
 */
export function SectionTitleRenderer({
  props,
}: {
  props: SectionTitlePayload
}) {
  return (
    <div
      className={cn(
        "px-6 pt-8 pb-4",
        props.topRule && "border-t border-border-subtle",
      )}
    >
      <Heading level={2}>{props.title}</Heading>
    </div>
  )
}
