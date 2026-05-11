import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Closing" }

export default async function ClosingOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Overview"
      orgSlug={orgSlug}
      subpath="closing"
      description="Year-end and period closing. Pick a tab to drill in."
    />
  )
}
