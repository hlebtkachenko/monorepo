"use client"

import {
  ContentHeader,
  ContentPanel,
  sectionEmpty,
  useOptimisticFavorite,
} from "@workspace/ui/blocks/content-panel"
import type {
  ContentHeaderBreadcrumbItem,
  ContentHeaderFavoriteToggle,
} from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"

export interface ArchetypeBlankProps {
  /** Page title shown in the content header (no view tabs). */
  title: string
  /** Optional ancestor trail left of the title. */
  breadcrumb?: ContentHeaderBreadcrumbItem[]
  /** Copy for the single full-height `Empty` section that fills the body. */
  emptyTitle?: string
  /**
   * Optional self-managing favorite star for this page's header. Omit → no star.
   * The archetype owns the optimism (via `useOptimisticFavorite`); the page
   * supplies only the seed state + how to persist.
   */
  favorite?: ContentHeaderFavoriteToggle
}

/**
 * ArchetypeBlank — the Blank archetype: a layout for the WHOLE Content Panel of
 * a page with nothing in it. It composes the reusable blocks + a section, with
 * no hardcoded chrome:
 *   - ContentHeader — title only, NO view tabs
 *   - no ContentToolbar
 *   - ContentBody — ONE full-height `Empty` section
 *   - no ContentFooter
 * Fed data; owns the composition. (The archetype is "Blank"; the section it
 * places is "Empty" — two different layers.)
 */
export function ArchetypeBlank({
  title,
  breadcrumb,
  emptyTitle,
  favorite,
}: ArchetypeBlankProps) {
  const favoriteControlled = useOptimisticFavorite(favorite)
  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title={title}
          breadcrumb={breadcrumb}
          favorite={favoriteControlled}
        />
      </AppPageHeader>
      <ContentPanel sections={[sectionEmpty({ title: emptyTitle })]} />
    </>
  )
}
