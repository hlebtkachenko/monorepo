import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Year closing" }

export default async function YearClosingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Year" orgSlug={orgSlug} subpath="closing/year" />
}
