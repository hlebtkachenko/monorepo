import { notFound } from "next/navigation"

import { getClosingObligations } from "../_lib/closing-data"
import { ClosingCalendarView } from "../_components/closing-calendar-view"

export const metadata = { title: "Calendar" }

/**
 * Closing Calendar — the same real obligation set as the Overview board,
 * presented as a chronological deadline list grouped by month.
 */
export default async function ClosingCalendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const data = await getClosingObligations(orgSlug)
  if (data.status === "no-access") notFound()

  return <ClosingCalendarView slug={orgSlug} data={data} />
}
