import { notFound } from "next/navigation"

import { LaunchpadDemo } from "../../_components/launchpad-demo/launchpad-demo"

export const metadata = { title: "Launchpad demo" }

/**
 * SAVED DEMO (#425) — the Launchpad archetype prototype on the persistent org
 * shell: a folder / overview hub that lays out a page's navigation structure
 * (pinned, single, grouped + subpages, footer) as cards, with header view tabs
 * (All / Followed / Unread) and a per-card follow star. Reachable at
 * `/<org>/demo-launchpad`, hidden from nav (allow-listed in scripts/check-nav.ts).
 * DEV-ONLY: any production build returns 404, so the mock data never ships.
 */
export default function DemoLaunchpadPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <LaunchpadDemo />
}
