import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Chart of accounts" }

export default async function AccountingAccountsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Chart of accounts"
      orgSlug={orgSlug}
      subpath="accounting/accounts"
    />
  )
}
