import { notFound } from "next/navigation"

import { DebugClient } from "./debug-client"

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3010"

export const metadata = { title: "Debug" }

export default function DebugPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <DebugClient webBaseUrl={WEB_BASE_URL} />
}
