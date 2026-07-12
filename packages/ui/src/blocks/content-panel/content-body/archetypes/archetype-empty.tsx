"use client"

import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { useIcons } from "@workspace/ui/icon-packs"
import type { IconName } from "@workspace/ui/icon-packs"

import { type ArchetypeDescriptor, defineArchetype } from "./archetype"

/** Data payload for the Empty archetype. All plain data — no ReactNode. */
export interface ArchetypeEmptyProps {
  /** Optional glyph, by closed icon-union name (never a node). */
  readonly icon?: IconName
  /** Headline line. */
  readonly title: string
  /** Optional supporting copy. */
  readonly description?: string
}

/** The sole constructor for an Empty-archetype body descriptor. */
export function archetypeEmpty(
  props: ArchetypeEmptyProps,
): ArchetypeDescriptor<"empty", ArchetypeEmptyProps> {
  return defineArchetype("empty", props)
}

/**
 * Registry renderer for the Empty archetype — a full-height centred empty state
 * composed from the `Empty*` primitives. Registry-internal; not re-exported from
 * `content-panel/index.ts`.
 */
export function ArchetypeEmptyRenderer({
  props,
}: {
  props: ArchetypeEmptyProps
}) {
  const icons = useIcons()
  const Glyph = props.icon ? icons[props.icon] : null
  return (
    <Empty className="h-full">
      {Glyph ? (
        <EmptyMedia variant="icon">
          <Glyph />
        </EmptyMedia>
      ) : null}
      <EmptyTitle>{props.title}</EmptyTitle>
      {props.description ? (
        <EmptyDescription>{props.description}</EmptyDescription>
      ) : null}
    </Empty>
  )
}
