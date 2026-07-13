import type { LeafSectionKind, SectionRenderer } from "./section"
import { SectionEmptyRenderer } from "./section-empty"
import { SectionFormRenderer } from "./section-form-renderer"
import { SectionSpaceRenderer } from "./section-space"
import { SectionTabsRenderer } from "./section-tabs-renderer"

/**
 * The closed section registry — LEAF kinds only (a `group` is a container, not a
 * leaf; it is rendered by `SectionList`, not from here, which keeps the registry
 * free of an import cycle). Adding a key here is the SINGLE review-gated seam for
 * shipping a new leaf section kind. `satisfies` forces every `LeafSectionKind` to
 * have exactly one renderer — a new kind that forgets its renderer fails
 * typecheck, and a renderer for a kind not in `SECTION_KINDS` is rejected.
 */
export const SECTION_REGISTRY = {
  empty: SectionEmptyRenderer,
  form: SectionFormRenderer,
  tabs: SectionTabsRenderer,
  space: SectionSpaceRenderer,
} satisfies Record<LeafSectionKind, SectionRenderer<never>>
