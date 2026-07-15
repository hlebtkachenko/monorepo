import { ArchetypeTableView } from "./archetype-table-view"

export const metadata = { title: "Archetype Table" }

/**
 * Settings → Debug → Archetype Table — the reference page for the **Table**
 * archetype: ContentHeader (with views) · a fully-wired ContentToolbar (every
 * closed slot) · ContentBody with the RESERVED Table section (a placeholder —
 * the grid is deferred to the table-stack research) · a selection ContentFooter.
 * No status bar (legacy). The archetype is minted inside the client
 * `ArchetypeTableView` (branded descriptors can't cross RSC).
 */
export default function ArchetypeTablePage() {
  return <ArchetypeTableView />
}
