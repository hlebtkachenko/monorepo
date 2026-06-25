import { notFound } from "next/navigation"

import { ContentDemoBody } from "../../_components/content-demo/content-demo-body"
import { ContentDemoHeader } from "../../_components/content-demo/content-demo-header"
import { OrgContentProvider } from "../../_components/content-demo/context"
import { OrgPageHeader } from "../../_components/org-page-header"

export const metadata = { title: "Content panel demo" }

/**
 * SAVED DEMO — the invoices Content Panel preview, kept for reference after being
 * removed from the Company overview. Renders under the persistent shell like any
 * org page; `OrgContentProvider` links the demo's content header (portaled in via
 * `OrgPageHeader`) to its body. Reachable at `/<org>/demo`, hidden from nav
 * (allow-listed in scripts/check-nav.ts).
 *
 * DEV-ONLY: any production build (staging or prod) returns 404, so the mock data
 * never ships to a real environment. Relax the guard if a deployed demo is ever
 * wanted.
 */
export default function ContentPanelDemoPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <OrgContentProvider>
      <OrgPageHeader>
        <ContentDemoHeader />
      </OrgPageHeader>
      <ContentDemoBody />
    </OrgContentProvider>
  )
}
