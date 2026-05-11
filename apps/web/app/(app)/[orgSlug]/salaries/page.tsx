import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Salaries" }

export default async function SalariesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Salaries" orgSlug={orgSlug} />
}
