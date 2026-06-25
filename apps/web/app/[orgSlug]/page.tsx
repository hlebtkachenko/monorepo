import { ContentDemoBody } from "../_components/content-demo/content-demo-body"
import { ContentDemoHeader } from "../_components/content-demo/content-demo-header"
import { OrgContentProvider } from "../_components/content-demo/context"
import { OrgPageHeader } from "../_components/org-page-header"

export const metadata = {
  title: "Dashboard",
}

/**
 * Company dashboard — the org index BODY. The persistent shell (rail, sidebar,
 * header, assistant) is mounted by `layout.tsx`; this page only fills the
 * content body.
 *
 * TEMP: still the invoices demo. `OrgContentProvider` links the demo's content
 * header (tabs + page actions, portaled into the shell's content-header slot via
 * `OrgPageHeader`) to its body (toolbar + table + inspector). Replace with real
 * route-driven content later — see the Content Panel variants taxonomy.
 */
export default function CompanyDashboardPage() {
  return (
    <OrgContentProvider>
      <OrgPageHeader>
        <ContentDemoHeader />
      </OrgPageHeader>
      <ContentDemoBody />
    </OrgContentProvider>
  )
}
