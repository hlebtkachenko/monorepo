import type { ReactNode } from "react"

import { DetailTabsHeader } from "../../_components/detail-tabs-header"

/**
 * Debug section for exercising shared UI. Its subpages are driven by the
 * content-header tabs; the shell renders the page body below.
 */
export default function DebugLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DetailTabsHeader
        title="Debug"
        tabs={[
          {
            value: "input-fields",
            label: "Input Fields",
            href: "/platform/debug/input-fields",
          },
          {
            value: "xml-filing",
            label: "XML filing",
            href: "/platform/debug/xml-filing",
          },
          {
            value: "emails",
            label: "Emails",
            href: "/platform/debug/emails",
          },
        ]}
      />
      {children}
    </>
  )
}
