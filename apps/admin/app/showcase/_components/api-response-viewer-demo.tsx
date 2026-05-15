"use client"

import { ApiResponseViewer } from "@workspace/ui/components/api-response-viewer"

const sampleResponse = {
  status: 200,
  statusText: "OK",
  headers: {
    "content-type": "application/json",
    "x-request-id": "req_01HZ8K5N",
    "cache-control": "no-store",
  },
  body: {
    user: { id: 42, name: "Hleb", role: "admin" },
    permissions: ["read", "write"],
    settings: { theme: "dark", locale: "cs-CZ" },
  },
  timing: { dns: 12, connect: 24, ttfb: 86, download: 18, total: 140 },
}

const errorResponse = {
  status: 500,
  statusText: "Internal Server Error",
  headers: { "content-type": "application/json" },
  body: { error: "Unexpected failure", trace: "/api/handler:42" },
  timing: { total: 312 },
}

export function ApiResponseViewerDemo() {
  return (
    <div className="flex flex-col gap-6">
      <ApiResponseViewer response={sampleResponse} />
      <ApiResponseViewer response={errorResponse} />
    </div>
  )
}
