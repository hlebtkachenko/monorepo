import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "HR" }

export default async function HROverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Overview"
      orgSlug={orgSlug}
      subpath="hr"
      description="People and payments: employees, payroll, travels, expenses."
    />
  )
}
