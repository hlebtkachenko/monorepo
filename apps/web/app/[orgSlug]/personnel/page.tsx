import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Personnel" }

export default async function PersonnelOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Overview"
      orgSlug={orgSlug}
      subpath="personnel"
      description="People and payments: employees, payroll, travels, expenses."
    />
  )
}
