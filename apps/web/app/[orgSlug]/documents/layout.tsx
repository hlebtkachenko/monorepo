import type { ReactNode } from "react"
import { SectionTabs } from "../_components/section-tabs"

export default async function DocumentsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const base = `/${orgSlug}/documents`
  return (
    <div>
      <SectionTabs
        title="Documents"
        tabs={[
          { label: "Overview", href: base },
          { label: "Invoices received", href: `${base}/invoices-received` },
          { label: "Invoices issued", href: `${base}/invoices-issued` },
        ]}
      />
      {children}
    </div>
  )
}
