import type { ArchetypeKind, ArchetypeRenderer } from "./archetype"
import { ArchetypeEmptyRenderer } from "./archetype-empty"

/**
 * The closed archetype registry. Adding a key here is the SINGLE review-gated
 * seam for shipping a new archetype. `satisfies` forces every `ArchetypeKind` to
 * have exactly one renderer — a new kind that forgets its renderer fails
 * typecheck, and a renderer for a kind not in `ARCHETYPE_KINDS` is rejected.
 */
export const ARCHETYPE_REGISTRY = {
  empty: ArchetypeEmptyRenderer,
} satisfies Record<ArchetypeKind, ArchetypeRenderer<never>>
