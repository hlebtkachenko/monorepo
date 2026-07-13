import { type SectionDescriptor, defineSection } from "./section"

export interface SectionSpaceProps {
  /** Gap height in pixels. Default 16. */
  readonly size?: number
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
}

/** The default Space gap, in pixels. */
const DEFAULT_SPACE = 32

/**
 * The sole constructor for a Space-section descriptor — a pure vertical gap
 * between sections (e.g. before the first section). Natural-height, per-page
 * configurable via `size`.
 */
export function sectionSpace(
  props?: SectionSpaceProps,
): SectionDescriptor<"space", { size: number }> {
  const { anchor, size } = props ?? {}
  return defineSection("space", { size: size ?? DEFAULT_SPACE }, { anchor })
}

/**
 * SectionSpace — an empty vertical spacer. Purely presentational; carries no
 * content, just reserves `size` px of body height.
 */
export function SectionSpaceRenderer({ props }: { props: { size: number } }) {
  return <div aria-hidden style={{ height: props.size }} />
}
