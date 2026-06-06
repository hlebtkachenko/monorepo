import type { ReactNode } from "react"
import { SectionTabs } from "../_components/section-tabs"

export default async function HRLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const base = `/${orgSlug}/hr`
  return (
    <div>
      <SectionTabs
        title="HR"
        tabs={[
          { label: "Overview", href: base },
          { label: "Employees", href: `${base}/employees` },
          { label: "Payroll", href: `${base}/payroll` },
          { label: "Travels", href: `${base}/travels` },
          { label: "Expenses", href: `${base}/expenses` },
        ]}
      />
      {children}
    </div>
  )
}
