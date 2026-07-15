import { ObligationVouchersView } from "../../../../_components/saldokonto/obligation-vouchers-view"

export const metadata = { title: "Pohledávky" }

/** Pohledávky (receivables) — the RECEIVABLE leaf of `documents › Obligation vouchers`. */
export default async function ReceivableObligationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <ObligationVouchersView
      orgSlug={orgSlug}
      title="Pohledávky"
      direction="RECEIVABLE"
    />
  )
}
