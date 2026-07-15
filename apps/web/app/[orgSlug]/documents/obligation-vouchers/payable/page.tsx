import { ObligationVouchersView } from "../../../../_components/saldokonto/obligation-vouchers-view"

export const metadata = { title: "Závazky" }

/** Závazky (payables) — the PAYABLE leaf of `documents › Obligation vouchers`. */
export default async function PayableObligationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <ObligationVouchersView
      orgSlug={orgSlug}
      title="Závazky"
      direction="PAYABLE"
    />
  )
}
