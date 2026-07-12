import type { ComponentType } from "react"

/**
 * The archetype brand. A module-private `unique symbol` — NOT exported from this
 * file or the package. External code cannot name this key, so it cannot forge an
 * `ArchetypeDescriptor` by object literal or spread. This is the load-bearing
 * enforcement primitive: a JSX-typed slot does NOT enforce (TSX widens element
 * prop types to `any`), only a branded plain-data value produced by a closed
 * factory set does. A real (not `declare`-only) module-private symbol so the
 * key exists at runtime for `defineArchetype`/`isArchetypeDescriptor`, while
 * still being unnameable — and thus unforgeable — from outside this module.
 */
const ARCHETYPE_BRAND = Symbol("archetype-brand")

/** The closed set of archetype kinds. Extending this is review-gated. */
export const ARCHETYPE_KINDS = ["empty"] as const
export type ArchetypeKind = (typeof ARCHETYPE_KINDS)[number]

/**
 * A branded, plain-data description of one Content-Panel body. `kind` is public
 * data; `[ARCHETYPE_BRAND]` is unforgeable. A value of this type can only
 * originate from a factory in `archetypes/*` (e.g. `archetypeEmpty`).
 */
export interface ArchetypeDescriptor<
  K extends ArchetypeKind = ArchetypeKind,
  P = unknown,
> {
  readonly [ARCHETYPE_BRAND]: true
  readonly kind: K
  readonly props: P
}

/**
 * Internal-only: mint a branded descriptor. Available to the archetype factories
 * in this folder, but NOT re-exported from `content-panel/index.ts`, so app code
 * cannot call it. Factories are the sole construction path.
 */
export function defineArchetype<K extends ArchetypeKind, P>(
  kind: K,
  props: P,
): ArchetypeDescriptor<K, P> {
  return { [ARCHETYPE_BRAND]: true, kind, props } as ArchetypeDescriptor<K, P>
}

/** Dev-only guard: is this an authentically branded descriptor? */
export function isArchetypeDescriptor(
  value: unknown,
): value is ArchetypeDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[ARCHETYPE_BRAND] === true &&
    (ARCHETYPE_KINDS as readonly string[]).includes(
      (value as { kind: string }).kind,
    )
  )
}

/** A renderer entry in the closed registry: consumes the descriptor's `props`. */
export type ArchetypeRenderer<P = unknown> = ComponentType<{ props: P }>
