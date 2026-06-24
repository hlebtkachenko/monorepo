import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

const sidebarRowVariants = cva(
  // Mirrors the DropdownMenuItem visual language (accent highlight, size-4
  // icons) so the menu surfaces read as one system.
  "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      active: {
        // Selected = a quiet neutral fill (no brand colour), one notch
        // stronger than the hover wash so it reads as current without shouting.
        true: "bg-accent font-medium text-accent-foreground",
        false: "hover:bg-accent/60 hover:text-accent-foreground",
      },
      // Pages read as primary (foreground, like the Profile dropdown);
      // subpages + footer links are secondary (muted).
      muted: { true: "", false: "" },
    },
    compoundVariants: [
      { active: false, muted: false, class: "text-foreground" },
      { active: false, muted: true, class: "text-muted-foreground" },
    ],
    defaultVariants: { active: false, muted: false },
  },
)

export interface SidebarRowProps
  extends
    Omit<React.ComponentProps<"a">, "href">,
    VariantProps<typeof sidebarRowVariants> {
  href: string
  /** Leading icon node — footer rows only; module-nav rows are text-only. */
  icon?: React.ReactNode
  /** Trailing count/label badge value. */
  badge?: React.ReactNode
}

/**
 * The single row primitive shared by the module nav and the footer — one
 * source of truth for row layout, active styling, hover, focus ring and
 * truncation. Active is both visual and announced via `aria-current="page"`.
 */
export function SidebarRow({
  href,
  active,
  muted,
  icon,
  badge,
  className,
  children,
  ...props
}: SidebarRowProps) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(sidebarRowVariants({ active, muted }), className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge != null ? (
        <Badge variant="secondary" className="shrink-0">
          {badge}
        </Badge>
      ) : null}
    </a>
  )
}

/** Longest-prefix active match shared by the nav + footer (and the rail). */
export { longestPrefixMatch as activeHref } from "@workspace/ui/lib/active-path"
