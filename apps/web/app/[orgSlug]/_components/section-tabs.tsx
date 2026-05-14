"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"

export interface SectionTab {
  label: string
  href: string
}

interface SectionTabsProps {
  title: string
  tabs: SectionTab[]
}

/**
 * Horizontal sub-nav for an org section (Accounting, Finance, Closing,
 * Personnel, Documents). Highlights the active tab via the current
 * pathname. Wrap a section's children with this layout when the section
 * has multiple sibling pages.
 */
export function SectionTabs({ title, tabs }: SectionTabsProps) {
  const pathname = usePathname()
  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-6xl space-y-4 px-6 pt-8 pb-0">
        <h1>{title}</h1>
        <nav className="flex gap-1 text-sm">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/")
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "border-b-2 px-3 pb-3 transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
