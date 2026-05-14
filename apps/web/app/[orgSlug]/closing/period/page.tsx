import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Period closing" }

export default async function PeriodClosingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Period"
      orgSlug={orgSlug}
      subpath="closing/period"
      description="Month or quarter close: drives interim reporting."
    />
  )
}
