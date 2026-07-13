import { ArchetypeDetailsView } from "./archetype-details-view"

export const metadata = { title: "Archetype Details" }

/**
 * Settings → Debug → Archetype Details — the reference page for the **Details**
 * archetype: ContentHeader (no view tabs) · no ContentToolbar · ContentBody with
 * as many sections as the page wants · a Save / Discard ContentFooter. Shows two
 * stacked Form sections (one plus a duplicate). The archetype is minted inside
 * the client `ArchetypeDetailsView` (branded descriptors can't cross RSC).
 */
export default function ArchetypeDetailsPage() {
  return <ArchetypeDetailsView />
}
