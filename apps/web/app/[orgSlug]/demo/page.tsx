import { ContentDemoBody } from "../../_components/content-demo/content-demo-body"
import { ContentDemoHeader } from "../../_components/content-demo/content-demo-header"
import { OrgContentProvider } from "../../_components/content-demo/context"
import { OrgPageHeader } from "../../_components/org-page-header"

export const metadata = { title: "Content panel demo" }

/**
 * SAVED DEMO — the invoices Content Panel preview, kept here for reference after
 * being removed from the Company overview. Renders under the persistent shell
 * like any org page; `OrgContentProvider` links the demo's content header (tabs +
 * actions, portaled into the shell slot via `OrgPageHeader`) to its body
 * (toolbar + table + inspector). Reachable at `/<org>/demo`; intentionally NOT in
 * the nav (allow-listed in scripts/check-nav.ts). Dev/reference only — gate or
 * remove before production.
 */
export default function ContentPanelDemoPage() {
  return (
    <OrgContentProvider>
      <OrgPageHeader>
        <ContentDemoHeader />
      </OrgPageHeader>
      <ContentDemoBody />
    </OrgContentProvider>
  )
}
