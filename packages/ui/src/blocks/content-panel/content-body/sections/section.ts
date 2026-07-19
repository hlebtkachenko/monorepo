import type { ComponentType } from "react"

/**
 * The Section brand — a module-private `unique symbol`, mirroring the archetype
 * brand at the body-part granularity (Doc-01 §6: "Archetype and Section slots
 * must themselves be descriptor- or Section-branded, never ReactNode"). Sections
 * are the reusable parts an archetype places in the body; `ContentBody` renders
 * a list of them through the closed `SECTION_REGISTRY`.
 */
const SECTION_BRAND = Symbol("section-brand")

/**
 * The closed set of section kinds. Extending this is review-gated.
 *
 * The `details-*` kinds are the section family the Details archetype composes
 * (Form, Tabs, Table) plus its `details-group` container. `empty` and `space`
 * are generic, archetype-agnostic utility sections.
 */
export const SECTION_KINDS = [
  "empty",
  "details-form",
  "details-tabs",
  "details-table",
  "table",
  "pivot-table",
  "space",
  "details-group",
  // Inspector body sections — the same Section system, `inspector-*` prefixed,
  // each backed by a `blocks/inspector-sheet` component (see `section-inspector`).
  "inspector-key-details",
  "inspector-money-totals",
  "inspector-table",
  "inspector-paragraph",
  "inspector-linked-records",
  "inspector-activity-log",
  "inspector-attachments",
  "inspector-export",
] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

/**
 * `LeafSectionKind` — every section kind EXCEPT the `details-group` container.
 * These are the RENDERABLE leaf kinds: `SECTION_REGISTRY` keys on this type via
 * `Record<LeafSectionKind, SectionRenderer>` to force every leaf kind to have
 * exactly one renderer (a group is composed by `SectionList`, not the registry).
 */
export type LeafSectionKind = Exclude<SectionKind, "details-group">

/**
 * The leaf section kinds that compose a Details archetype BODY — the `details-*`
 * family (minus the `details-group` container) plus the archetype-agnostic
 * `space`/`empty`. The SINGLE source of truth that both a `details-group`'s
 * children AND the archetype `details` policy derive from, so a `table` /
 * `pivot-table` / `inspector-*` can never be smuggled into a Details body or
 * group. The policy (archetype layer) imports and spreads this value; the
 * reverse import is illegal, so the value lives here in the lower section layer.
 */
export const DETAILS_BODY_KINDS = [
  "details-form",
  "details-tabs",
  "details-table",
  "space",
  "empty",
] as const satisfies readonly SectionKind[]
export type DetailsBodySectionKind = (typeof DETAILS_BODY_KINDS)[number]

/** Section-level metadata that every kind shares (not per-kind `props`). */
export interface SectionMeta {
  /**
   * Optional URL/scroll anchor — a stable slug applied as the section's DOM `id`
   * by `ContentBody`, so `…/page#legal-identity` deep-links, CLI/agent links,
   * and docs help-center links can navigate straight to a section.
   */
  readonly anchor?: string
  /**
   * Whether the section fills the remaining body height (`flex-1`) rather than
   * taking its natural height. `Empty` fills (a blank page centres it); `Form`
   * and `Space` are natural-height and the body scrolls past them. Default false.
   */
  readonly fill?: boolean
}

/** A branded, plain-data description of one body Section. */
export interface SectionDescriptor<
  K extends SectionKind = SectionKind,
  P = unknown,
> extends SectionMeta {
  readonly [SECTION_BRAND]: true
  readonly kind: K
  readonly props: P
}

/** Internal-only minter — factories are the sole construction path. */
export function defineSection<K extends SectionKind, P>(
  kind: K,
  props: P,
  meta?: SectionMeta,
): SectionDescriptor<K, P> {
  return {
    [SECTION_BRAND]: true,
    kind,
    props,
    anchor: meta?.anchor,
    fill: meta?.fill,
  } as SectionDescriptor<K, P>
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
