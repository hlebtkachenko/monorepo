import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Invoices received" }

export default async function InvoicesReceivedPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Invoices received"
      orgSlug={orgSlug}
      subpath="documents/invoices-received"
    />
  )
}
