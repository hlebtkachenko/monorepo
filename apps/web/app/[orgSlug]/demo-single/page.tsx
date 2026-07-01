import { notFound } from "next/navigation"

import { SingleDemo } from "../../_components/single-demo/single-demo"

export const metadata = { title: "Single demo" }

/**
 * SAVED DEMO (#425) — the Single archetype prototype (an ABRA-style record
 * workspace) on the persistent org shell. A Back button + the record number /
 * status / relation pills sit in the content header. The body is three
 * side-by-side panels (Document / Party / Amounts), each with its OWN local tab
 * strip; the Amounts panel carries the per-rate VAT recap table. A full-width
 * editable line-items grid sits below, a ContentToolbar carries the record
 * actions, a ContentStatusBar pins Base / VAT / Total (live off the grid), and a
 * split Save / Close footer closes it out. Reachable at `/<org>/demo-single`,
 * hidden from nav (allow-listed in scripts/check-nav.ts). DEV-ONLY: any
 * production build returns 404.
 */
export default function DemoSinglePage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <SingleDemo />
}
