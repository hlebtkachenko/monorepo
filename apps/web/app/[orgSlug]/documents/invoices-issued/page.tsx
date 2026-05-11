import { SectionStub } from "../../_components/section-stub"

export const metadata = { title: "Invoices issued" }

export default async function InvoicesIssuedPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <SectionStub
      title="Invoices issued"
      orgSlug={orgSlug}
      subpath="documents/invoices-issued"
    />
  )
}
