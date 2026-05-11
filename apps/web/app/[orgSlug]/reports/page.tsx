import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Reports" }

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Reports" orgSlug={orgSlug} />
}
