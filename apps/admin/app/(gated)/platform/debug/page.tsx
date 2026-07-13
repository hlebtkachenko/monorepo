import { redirect } from "next/navigation"

export const metadata = { title: "Debug" }

/** The Debug landing redirects to its first subpage. */
export default function DebugPage() {
  redirect("/platform/debug/input-fields")
}
