import { notFound } from "next/navigation"

import { OutboxView } from "./outbox-view"

export const metadata = { title: "Dev outbox" }
export const dynamic = "force-dynamic"

export default function DevOutboxPage() {
  // Test-endpoint double-gate convention: NODE_ENV + explicit env flag
  // (same flag as the /api/dev/outbox route this page reads from).
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEV_OUTBOX !== "1"
  ) {
    notFound()
  }
  return <OutboxView />
}
