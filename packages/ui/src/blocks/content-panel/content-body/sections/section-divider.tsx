import { type SectionDescriptor, defineSection } from "./section"

export interface SectionDividerProps {
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
}

/**
 * The sole constructor for a Divider-section descriptor — a full-ContentBody-
 * width hairline rule the page places explicitly (e.g. above and below a group
 * of Form sections). Symmetric: the same primitive draws a group's top and
 * bottom rule, so the last group is closed as cleanly as any other.
 */
export function sectionDivider(
  props?: SectionDividerProps,
): SectionDescriptor<"divider", Record<string, never>> {
  return defineSection("divider", {}, { anchor: props?.anchor })
}

/**
 * SectionDivider — a single full-width hairline. Decorative (grouping is carried
 * semantically by the Title/heading, not the rule).
 */
export function SectionDividerRenderer(_: { props: Record<string, never> }) {
  return <div aria-hidden className="border-t border-border-subtle" />
}
