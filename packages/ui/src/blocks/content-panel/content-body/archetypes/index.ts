// Public archetype surface — the factory + payload/descriptor types + the kind
// enumeration. Deliberately NOT exported: `defineArchetype` (internal minter),
// the `*Renderer` components, and `registry` — so app code can only obtain a
// descriptor from a factory, never forge one.
export { archetypeEmpty } from "./archetype-empty"
export type { ArchetypeEmptyProps } from "./archetype-empty"
export type { ArchetypeDescriptor, ArchetypeKind } from "./archetype"
export { ARCHETYPE_KINDS } from "./archetype"
