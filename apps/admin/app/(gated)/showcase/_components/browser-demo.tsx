"use client"

import { Browser } from "@workspace/ui/components/browser"

export function BrowserDemo() {
  return (
    <div className="h-[480px] w-full">
      <Browser
        showWindowControls
        enableTabManagement
        showBookmarksBar
        initialTabs={[
          { id: "1", title: "Docs", url: "https://docs.example.com" },
          { id: "2", title: "Repo", url: "https://github.com/example" },
        ]}
      />
    </div>
  )
}
