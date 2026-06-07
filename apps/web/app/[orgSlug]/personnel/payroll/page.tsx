import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Payroll" }

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Payroll"
      orgSlug={orgSlug}
      subpath="personnel/payroll"
    />
  )
}
