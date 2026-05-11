import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Cash" }

export default async function CashPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Cash" orgSlug={orgSlug} subpath="finance/cash" />
}
