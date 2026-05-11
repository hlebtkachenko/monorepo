import type { ReactNode } from "react"
import { SectionTabs } from "../_components/section-tabs"

export default async function AccountingLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const base = `/${orgSlug}/accounting`
  return (
    <div>
      <SectionTabs
        title="Accounting"
        tabs={[
          { label: "Overview", href: base },
          { label: "Ledger", href: `${base}/ledger` },
          { label: "Journal", href: `${base}/journal` },
          { label: "Posting", href: `${base}/posting` },
          { label: "Accounts", href: `${base}/accounts` },
        ]}
      />
      {children}
    </div>
  )
}
