import { ArchetypeBlank } from "../../../_components/archetypes/archetype-blank"

export const metadata = { title: "Debug" }

/**
 * Settings → Debug — a developer/debug landing. Itself rendered with the Blank
 * archetype; pick a debug subpage from the sidebar.
 */
export default function DebugPage() {
  return (
    <ArchetypeBlank
      title="Debug"
      emptyTitle="Developer & debug pages — pick one from the sidebar."
    />
  )
}
