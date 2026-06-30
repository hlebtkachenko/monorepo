import { notFound } from "next/navigation"

import { SingleDemo } from "../../_components/single-demo/single-demo"

export const metadata = { title: "Single demo" }

/**
 * SAVED DEMO (#425) — the Single (one-record detail) archetype prototype on the
 * persistent org shell. The record title / status / actions sit in the content
 * header; header tabs (Details / Activity / Attachments) swap the body. Reachable
 * at `/<org>/demo-single`, hidden from nav (allow-listed in scripts/check-nav.ts).
 * DEV-ONLY: any production build returns 404.
 */
export default function DemoSinglePage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <SingleDemo />
}
