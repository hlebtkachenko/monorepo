import { AppPageHeader } from "../../_components/app-page-header"
import { DeadlinesBody } from "../../_components/workspace/deadlines/deadlines-body"
import { DeadlinesHeader } from "../../_components/workspace/deadlines/deadlines-header"
import { DeadlinesProvider } from "../../_components/workspace/deadlines/context"
import { DEADLINE_ROWS } from "../../_components/workspace/deadlines/data"

export const metadata = { title: "Deadlines" }

/**
 * Deadlines — the accountant office's cross-client statutory obligation board
 * for the active workspace. The Table archetype, entirely MOCK: no obligation
 * source is wired yet, so a static deterministic fixture (`DEADLINE_ROWS`)
 * drives the table. No auth/db read is needed until a real source lands.
 */
export default function DeadlinesPage() {
  return (
    <DeadlinesProvider>
      <AppPageHeader>
        <DeadlinesHeader />
      </AppPageHeader>
      <DeadlinesBody rows={DEADLINE_ROWS} />
    </DeadlinesProvider>
  )
}
