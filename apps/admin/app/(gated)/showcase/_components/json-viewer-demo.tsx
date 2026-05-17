"use client"

import { JsonViewer } from "@workspace/ui/components/json-viewer"

const sample = {
  id: 42,
  name: "Hleb",
  active: true,
  roles: ["admin", "owner"],
  profile: {
    email: "hleb@example.com",
    locale: "cs-CZ",
    settings: { theme: "dark", notifications: null, density: "comfortable" },
  },
}

export function JsonViewerDemo() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Default
        </h3>
        <JsonViewer data={sample} />
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          Searchable
        </h3>
        <JsonViewer data={sample} searchable />
      </div>
    </div>
  )
}
