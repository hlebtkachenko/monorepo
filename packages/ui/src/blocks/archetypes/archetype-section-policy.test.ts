import { describe, expect, it } from "vitest"

import { SECTION_KINDS, sectionEmpty } from "@workspace/ui/blocks/content-panel"
import type {
  SectionDescriptor,
  SectionKind,
} from "@workspace/ui/blocks/content-panel"

import {
  ARCHETYPE_SECTION_POLICY,
  assertSectionsAllowed,
} from "./archetype-section-policy"
import type { AllowedSectionKind } from "./archetype-section-policy"

describe("archetype-section-policy — runtime governance", () => {
  it("every archetype's allowed kinds are real SECTION_KINDS", () => {
    const known = new Set<string>(SECTION_KINDS)
    for (const [archetype, kinds] of Object.entries(ARCHETYPE_SECTION_POLICY)) {
      for (const kind of kinds) {
        expect(known.has(kind), `${archetype} → ${kind}`).toBe(true)
      }
    }
  })

  it("no body policy contains an inspector-* kind (those are rail sections)", () => {
    for (const [archetype, kinds] of Object.entries(ARCHETYPE_SECTION_POLICY)) {
      for (const kind of kinds) {
        expect(kind.startsWith("inspector-"), `${archetype} → ${kind}`).toBe(
          false,
        )
      }
    }
  })

  it("details-group is a Details-only container", () => {
    expect(ARCHETYPE_SECTION_POLICY.details).toContain("details-group")
    expect(ARCHETYPE_SECTION_POLICY.table).not.toContain("details-group")
  })
})

describe("assertSectionsAllowed — dev-only cast-bypass belt", () => {
  it("accepts sections the archetype allows", () => {
    expect(() => assertSectionsAllowed("table", [sectionEmpty()])).not.toThrow()
    expect(() =>
      assertSectionsAllowed("details", [sectionEmpty()]),
    ).not.toThrow()
  })

  it("throws when a forbidden kind is smuggled in by a cast", () => {
    // The type already rejects this at compile time; the guard is the runtime
    // belt for a deliberate `as`-cast (the realistic agent-bypass path).
    const smuggledIntoTable = {
      kind: "details-form",
      props: {},
    } as unknown as SectionDescriptor
    expect(() => assertSectionsAllowed("table", [smuggledIntoTable])).toThrow(
      /may not host a "details-form"/,
    )

    const smuggledIntoDetails = {
      kind: "table",
      props: {},
    } as unknown as SectionDescriptor
    expect(() =>
      assertSectionsAllowed("details", [smuggledIntoDetails]),
    ).toThrow(/may not host a "table"/)
  })
})

// ---------------------------------------------------------------------------
// Compile-time governance — validated by `pnpm typecheck`, not the runtime run.
// Each invariant is asserted as an EXACT boolean (no `@ts-expect-error`, whose
// placement is formatter-fragile). A broken invariant is a tsc error, guarding
// the type-level rules the runtime tests can't reach.
// ---------------------------------------------------------------------------
type Assert<T extends true> = T
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
// Tuple-wrapped so a union `A` (e.g. SectionKind) is checked as a WHOLE, not
// distributed member-by-member (which would collapse to `boolean`).
type Assignable<A, B> = [A] extends [B] ? true : false

// (The details-group ↔ details-policy binding is now true BY CONSTRUCTION — both
// derive from the one `DETAILS_BODY_KINDS` tuple in section.ts — so no drift
// fixture is needed here anymore.)

// `as const` in the policy is load-bearing: AllowedSectionKind<"table"> must be a
// STRICT subset of SectionKind. Drop the `as const` and it widens to the full
// union, silently killing every narrowing — both directions are pinned here.
type _TableSubsetOfSectionKind = Assert<
  Assignable<AllowedSectionKind<"table">, SectionKind>
>
type _SectionKindNotNarrowed = Assert<
  Equals<Assignable<SectionKind, AllowedSectionKind<"table">>, false>
>

// The archetype `sections` prop binds: a Table section is accepted for the Table
// body, a Details section is rejected.
type _TableSectionAccepted = Assert<
  Assignable<
    SectionDescriptor<"table">,
    SectionDescriptor<AllowedSectionKind<"table">>
  >
>
type _DetailsSectionRejected = Assert<
  Equals<
    Assignable<
      SectionDescriptor<"details-form">,
      SectionDescriptor<AllowedSectionKind<"table">>
    >,
    false
  >
>
