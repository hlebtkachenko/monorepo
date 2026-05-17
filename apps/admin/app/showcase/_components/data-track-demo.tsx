"use client"

import { DataTrack } from "@workspace/ui/components/data-track"

const spendData = [
  { name: "Consulting", value: 184000 },
  { name: "Licenses", value: 121500 },
  { name: "Support", value: 73200 },
  { name: "Training", value: 38900 },
]

const linkData = [
  { name: "github.com", value: 4210, href: "https://github.com" },
  { name: "stripe.com", value: 2870, href: "https://stripe.com" },
  { name: "vercel.com", value: 1650, href: "https://vercel.com" },
]

const trackerData = Array.from({ length: 30 }, (_, i) => ({
  key: i,
  color: i % 9 === 0 ? "var(--chart-4)" : "var(--chart-2)",
  tooltip: i % 9 === 0 ? "Degraded" : "Operational",
}))

export function DataTrackListFormatted() {
  return (
    <DataTrack
      variant="list"
      data={spendData}
      valueFormatter={(v) => `${(v / 1000).toFixed(1)}k Kč`}
    />
  )
}

export function DataTrackListLinks() {
  return <DataTrack variant="list" data={linkData} />
}

export function DataTrackTrackerDemo() {
  return <DataTrack variant="tracker" data={trackerData} />
}
