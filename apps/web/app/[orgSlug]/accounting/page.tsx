import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Accounting" }

export default async function AccountingOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Overview"
      orgSlug={orgSlug}
      subpath="accounting"
      description="General accounting: ledger, journal, posting, chart of accounts. Pick a tab to drill in."
    />
  )
}
