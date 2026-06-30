import { notFound } from "next/navigation"

import { SingleDemo } from "../../_components/single-demo/single-demo"

export const metadata = { title: "Single demo" }

/**
 * SAVED DEMO (#425) — the Single archetype prototype (an ABRA-style record
 * workspace) on the persistent org shell. The record number / status / Save sit
 * in the content header; section tabs (Header / Accounting / Other / Payment /
 * Attachments) swap the body, a toolbar toggles a document preview, and the
 * Header section shows the line-items grid + a VAT recap rail. Reachable at
 * `/<org>/demo-single`, hidden from nav (allow-listed in scripts/check-nav.ts).
 * DEV-ONLY: any production build returns 404.
 */
export default function DemoSinglePage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <SingleDemo />
}
