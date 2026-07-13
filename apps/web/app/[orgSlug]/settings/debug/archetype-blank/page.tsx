import { ArchetypeBlank } from "@workspace/ui/blocks/archetypes"

export const metadata = { title: "Archetype Blank" }

/**
 * Settings → Debug → Archetype Blank — the reference page for the **Blank**
 * archetype: ContentHeader (no view tabs) · no ContentToolbar · ContentBody with
 * one full-height `Empty` section · no ContentFooter.
 */
export default function ArchetypeBlankPage() {
  return (
    <ArchetypeBlank
      title="Archetype Blank"
      emptyTitle="This page is intentionally blank."
    />
  )
}
