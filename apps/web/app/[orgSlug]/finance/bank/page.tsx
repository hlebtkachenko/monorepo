import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Bank" }

export default async function BankPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Bank" orgSlug={orgSlug} subpath="finance/bank" />
}
