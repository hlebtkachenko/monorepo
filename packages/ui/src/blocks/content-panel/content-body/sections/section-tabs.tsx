import { type SectionDescriptor, defineSection } from "./section"
import type { FormField } from "./section-form"

/** One tab: a label and its own field grid. */
export interface FormTab {
  readonly id: string
  readonly label: string
  readonly fields: readonly FormField[]
}

export interface SectionTabsProps {
  /** Left-column heading for the group. */
  readonly title: string
  /** Left-column supporting copy under the heading. */
  readonly description?: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /** The tabs shown on the right; each carries its own fields. */
  readonly tabs: readonly FormTab[]
  /** `id` of the initially-active tab. Defaults to the first tab. */
  readonly defaultTab?: string
}

export interface SectionTabsPayload {
  readonly title: string
  readonly description?: string
  readonly tabs: readonly FormTab[]
  readonly defaultTab?: string
}

/**
 * The sole constructor for a Tabs-section descriptor — a Form section whose
 * right column is a set of tabs (default segmented variant), each tab holding
 * its own 6-column field grid. Tab switching is internal UI state driven by
 * data (`tabs` + `defaultTab`); no callbacks cross the descriptor.
 */
export function sectionTabs({
  anchor,
  ...props
}: SectionTabsProps): SectionDescriptor<"tabs", SectionTabsPayload> {
  return defineSection("tabs", props, { anchor })
}
