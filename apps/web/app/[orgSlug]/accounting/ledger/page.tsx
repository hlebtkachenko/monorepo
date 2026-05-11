import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Ledger" }

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub title="Ledger" orgSlug={orgSlug} subpath="accounting/ledger" />
  )
}
