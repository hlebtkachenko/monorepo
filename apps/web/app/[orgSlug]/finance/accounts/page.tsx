import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Accounts" }

export default async function FinanceAccountsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Accounts"
      orgSlug={orgSlug}
      subpath="finance/accounts"
    />
  )
}
