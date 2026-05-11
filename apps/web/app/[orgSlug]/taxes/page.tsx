import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Taxes" }

export default async function TaxesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Taxes" orgSlug={orgSlug} />
}
