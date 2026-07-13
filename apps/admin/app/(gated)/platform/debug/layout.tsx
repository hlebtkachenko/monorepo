import type { ReactNode } from "react"
import { notFound } from "next/navigation"

import { DetailTabsHeader } from "../../_components/detail-tabs-header"

/**
 * Debug section — a dev-only surface for exercising shared UI. Its subpages are
 * driven by the content-header tabs; the shell renders the page body below.
 * Dev-gated: the whole subtree is hidden in a production build.
 */
export default function DebugLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound()

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
        ]}
      />
      {children}
    </>
  )
}
