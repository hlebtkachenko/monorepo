import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Transactions" }

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Transactions" orgSlug={orgSlug} />
}
