import { DETAILS_BODY_KINDS } from "@workspace/ui/blocks/content-panel"
import type {
  SectionDescriptor,
  SectionKind,
} from "@workspace/ui/blocks/content-panel"

/**
 * archetype-section-policy — the section-library LAW.
 *
 * Each archetype's body may host only certain SECTION kinds. This module is the
 * single, machine-enforced source of truth for that mapping. The archetype
 * `sections` props derive their accepted kinds from `AllowedSectionKind<A>`, so
 * wiring a section into the wrong archetype body is a real `tsc` error — a page
 * author (human or agent) simply cannot ship it. `assertSectionsAllowed` is the
 * dev-only runtime belt that also catches a deliberate `as`-cast around the type.
 *
 * inspector-* kinds are deliberately absent from every entry: they are inspector
 * RAIL sections (a separate slot, `AppInspectorRail`), never body sections.
 */

/**
 * The archetypes that own a GOVERNED body-section slot. `ArchetypeBlank` is
 * deliberately absent: it exposes no `sections` prop (it hardcodes a single
 * Empty section), so there is nothing to govern. `Launchpad` / `Dashboard` /
 * `Single` are not closed archetypes yet (#787) — add them here (and to the
 * policy below) when they land with a `sections` slot.
 */
export type ArchetypeKind = "table" | "details"

/**
 * The law: archetype → the section kinds its BODY may host.
 *
 * `as const` is LOAD-BEARING and must stay before `satisfies`. Without it,
 * `satisfies Record<ArchetypeKind, readonly SectionKind[]>` widens each value to
 * `SectionKind[]`, so `(typeof ...)[A][number]` collapses `AllowedSectionKind`
 * back to the full `SectionKind` union — silently defeating every narrowing.
 * The `archetype-section-policy.test.ts` type fixtures guard against exactly that
 * regression.
 *
 * The Details entry derives from `DETAILS_BODY_KINDS` (the section-layer source
 * of truth) plus the `details-group` container — one list, no drift.
 */
export const ARCHETYPE_SECTION_POLICY = {
  table: ["table", "pivot-table", "tree-table", "space", "empty"],
  details: [...DETAILS_BODY_KINDS, "details-group"],
} as const satisfies Record<ArchetypeKind, readonly SectionKind[]>

/** The section kinds archetype `A`'s body may host, as a narrowed union. */
export type AllowedSectionKind<A extends ArchetypeKind> =
  (typeof ARCHETYPE_SECTION_POLICY)[A][number]

/**
 * Dev-only runtime guard mirroring `isSectionDescriptor`: a section whose `kind`
 * is not in the archetype's policy throws in development (an `as`-cast is the
 * only way to reach here past the type). No-op in production. Call it at the top
 * of an archetype that accepts a `sections` prop.
 */
export function assertSectionsAllowed(
  archetype: ArchetypeKind,
  sections: readonly SectionDescriptor[],
): void {
  if (process.env.NODE_ENV === "production") return
  const allowed = ARCHETYPE_SECTION_POLICY[archetype] as readonly SectionKind[]
  for (const section of sections) {
    if (!allowed.includes(section.kind)) {
      throw new Error(
        `Archetype "${archetype}" body may not host a "${section.kind}" section. ` +
          `Allowed: ${allowed.join(", ")}. ` +
          `The section library is defined in archetype-section-policy.ts — do not cast around it.`,
      )
    }
  }
}
