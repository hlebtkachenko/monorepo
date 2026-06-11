"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Heading } from "@workspace/ui/components/heading"
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
 * HR, Documents). Highlights the active tab via the current
 * pathname. Wrap a section's children with this layout when the section
 * has multiple sibling pages.
 */
export function SectionTabs({ title, tabs }: SectionTabsProps) {
  const pathname = usePathname()
  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-6xl space-y-4 px-6 pt-8 pb-0">
        <Heading level={2} className="mt-0">
          {title}
        </Heading>
        {/* Scrollable at narrow widths — tabs never wrap or overflow
            the page; scrollbar hidden per design idiom. */}
        <nav className="no-scrollbar flex gap-1 overflow-x-auto text-sm">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/")
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "shrink-0 border-b-2 px-3 pb-3 whitespace-nowrap transition-colors",
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
