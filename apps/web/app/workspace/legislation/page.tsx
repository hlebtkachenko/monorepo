import { AppPageHeader } from "../../_components/app-page-header"
import { LegislationBody } from "../../_components/workspace/legislation/legislation-body"
import { LegislationHeader } from "../../_components/workspace/legislation/legislation-header"
import { LegislationProvider } from "../../_components/workspace/legislation/context"
import { OBLIGATION_ROWS } from "../../_components/workspace/legislation/data"

export const metadata = { title: "Legislation" }

/**
 * Legislation — the accountant office's cross-client statutory obligation board
 * for the active workspace. The Table archetype, entirely MOCK: no obligation
 * source is wired yet, so a static deterministic fixture (`OBLIGATION_ROWS`)
 * drives the table. No auth/db read is needed until a real source lands.
 */
export default function LegislationPage() {
  return (
    <LegislationProvider>
      <AppPageHeader>
        <LegislationHeader />
      </AppPageHeader>
      <LegislationBody rows={OBLIGATION_ROWS} />
    </LegislationProvider>
  )
}
