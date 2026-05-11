import type { ReactNode } from "react"
import { SectionTabs } from "../_components/section-tabs"

export default async function FinanceLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const base = `/${orgSlug}/finance`
  return (
    <div>
      <SectionTabs
        title="Finance"
        tabs={[
          { label: "Overview", href: base },
          { label: "Bank", href: `${base}/bank` },
          { label: "Cash", href: `${base}/cash` },
          { label: "Accounts", href: `${base}/accounts` },
          { label: "Credits", href: `${base}/credits` },
        ]}
      />
      {children}
    </div>
  )
}
