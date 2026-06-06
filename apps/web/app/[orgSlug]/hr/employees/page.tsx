import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Employees" }

export default async function EmployeesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub title="Employees" orgSlug={orgSlug} subpath="hr/employees" />
  )
}
