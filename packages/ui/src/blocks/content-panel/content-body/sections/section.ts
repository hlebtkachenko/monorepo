import type { ComponentType } from "react"

/**
 * The Section brand — a module-private `unique symbol`, mirroring the archetype
 * brand at the body-part granularity (Doc-01 §6: "Archetype and Section slots
 * must themselves be descriptor- or Section-branded, never ReactNode"). Sections
 * are the reusable parts an archetype places in the body; `ContentBody` renders
 * a list of them through the closed `SECTION_REGISTRY`.
 */
const SECTION_BRAND = Symbol("section-brand")

/** The closed set of section kinds. Extending this is review-gated. */
export const SECTION_KINDS = ["empty"] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

/** A branded, plain-data description of one body Section. */
export interface SectionDescriptor<
  K extends SectionKind = SectionKind,
  P = unknown,
> {
  readonly [SECTION_BRAND]: true
  readonly kind: K
  readonly props: P
}

/** Internal-only minter — factories are the sole construction path. */
export function defineSection<K extends SectionKind, P>(
  kind: K,
  props: P,
): SectionDescriptor<K, P> {
  return { [SECTION_BRAND]: true, kind, props } as SectionDescriptor<K, P>
}

/** Dev-only guard: is this an authentically branded section descriptor? */
export function isSectionDescriptor(
  value: unknown,
): value is SectionDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[SECTION_BRAND] === true &&
    (SECTION_KINDS as readonly string[]).includes(
      (value as { kind: string }).kind,
    )
  )
}

/** A renderer entry in the closed section registry: consumes the section `props`. */
export type SectionRenderer<P = unknown> = ComponentType<{ props: P }>
