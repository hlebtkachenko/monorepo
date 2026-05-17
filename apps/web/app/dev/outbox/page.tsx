import { notFound } from "next/navigation"

import { OutboxView } from "./outbox-view"

export const metadata = { title: "Dev outbox" }
export const dynamic = "force-dynamic"

export default function DevOutboxPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <OutboxView />
}
