import { ObligationVouchersView } from "../../../_components/saldokonto/obligation-vouchers-view"

export const metadata = { title: "Závazky a pohledávky" }

/**
 * Doklady závazků a pohledávek (obligation vouchers) — open items in both directions. Fills the wired
 * `documents › Obligation vouchers` nav slot; the same `open_item` reads the saldokonto page uses.
 */
export default async function ObligationVouchersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <ObligationVouchersView orgSlug={orgSlug} title="Závazky a pohledávky" />
  )
}
