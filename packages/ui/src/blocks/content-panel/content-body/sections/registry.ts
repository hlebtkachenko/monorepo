import type { LeafSectionKind, SectionRenderer } from "./section"
import { SectionEmptyRenderer } from "./section-empty"
import { SectionDetailsFormRenderer } from "./section-details-form-renderer"
import { SectionDetailsTableRenderer } from "./section-details-table-renderer"
import { SectionSpaceRenderer } from "./section-space"
import { SectionDetailsTabsRenderer } from "./section-details-tabs-renderer"

/**
 * The closed section registry — LEAF kinds only (a `details-group` is a
 * container, not a leaf; it is rendered by `SectionList`, not from here, which
 * keeps the registry free of an import cycle). Adding a key here is the SINGLE
 * review-gated seam for shipping a new leaf section kind. `satisfies` forces
 * every `LeafSectionKind` to have exactly one renderer — a new kind that forgets
 * its renderer fails typecheck, and a renderer for a kind not in `SECTION_KINDS`
 * is rejected.
 */
export const SECTION_REGISTRY = {
  empty: SectionEmptyRenderer,
  "details-form": SectionDetailsFormRenderer,
  "details-tabs": SectionDetailsTabsRenderer,
  "details-table": SectionDetailsTableRenderer,
  space: SectionSpaceRenderer,
} satisfies Record<LeafSectionKind, SectionRenderer<never>>
