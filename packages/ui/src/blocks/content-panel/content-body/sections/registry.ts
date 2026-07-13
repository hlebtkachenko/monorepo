import type { SectionKind, SectionRenderer } from "./section"
import { SectionEmptyRenderer } from "./section-empty"
import { SectionFormRenderer } from "./section-form-renderer"
import { SectionSpaceRenderer } from "./section-space"

/**
 * The closed section registry. Adding a key here is the SINGLE review-gated
 * seam for shipping a new section kind. `satisfies` forces every `SectionKind`
 * to have exactly one renderer — a new kind that forgets its renderer fails
 * typecheck, and a renderer for a kind not in `SECTION_KINDS` is rejected.
 * Mirrors `archetypes/registry.ts` at the body-part granularity.
 */
export const SECTION_REGISTRY = {
  empty: SectionEmptyRenderer,
  form: SectionFormRenderer,
  space: SectionSpaceRenderer,
} satisfies Record<SectionKind, SectionRenderer<never>>
