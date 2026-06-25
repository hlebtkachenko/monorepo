import { ModulePage } from "./_components/module-page"

export const metadata = { title: "Company" }

/**
 * Company overview — the org index. Clean module landing like the others; the
 * old invoices demo moved to `/<org>/demo` (saved for reference). The persistent
 * shell is mounted by `layout.tsx`; this page only fills the content body.
 */
export default function CompanyPage() {
  return (
    <ModulePage
      title="Company"
      description="Organization overview and key figures."
    />
  )
}
