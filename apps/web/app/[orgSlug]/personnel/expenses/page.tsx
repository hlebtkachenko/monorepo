import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Expenses" }

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Expenses"
      orgSlug={orgSlug}
      subpath="personnel/expenses"
    />
  )
}
