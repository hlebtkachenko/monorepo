import { notFound } from "next/navigation"

import { DevDashboard } from "./dev-dashboard"

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3010"

export const metadata = { title: "Dev tools" }

export default function DevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }
  return <DevDashboard webBaseUrl={WEB_BASE_URL} />
}
