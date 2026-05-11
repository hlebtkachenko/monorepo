import type { ReactNode } from "react"
import { SectionTabs } from "../_components/section-tabs"

export default async function ClosingLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const base = `/${orgSlug}/closing`
  return (
    <div>
      <SectionTabs
        title="Closing"
        tabs={[
          { label: "Overview", href: base },
          { label: "Year", href: `${base}/year` },
          { label: "Period", href: `${base}/period` },
        ]}
      />
      {children}
    </div>
  )
}
