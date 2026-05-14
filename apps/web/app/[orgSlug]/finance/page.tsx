import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Finance" }

export default async function FinanceOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Overview"
      orgSlug={orgSlug}
      subpath="finance"
      description="Money lives here: bank, cash, accounts, credits. Pick a tab to drill in."
    />
  )
}
