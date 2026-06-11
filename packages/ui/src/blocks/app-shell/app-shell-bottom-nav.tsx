"use client"

import {
  NavigationBottomMobile,
  NavigationBottomMobileItem,
  NavigationBottomMobileItemIcon,
  NavigationBottomMobileItemLabel,
  NavigationBottomMobileList,
} from "@workspace/ui/components/navigation-bottom-mobile"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"

/**
 * One bottom-nav item. Same data-in approach as AppRail's
 * `RailMenuItem` — surfaces pass an ordered list, the block renders.
 * Keep the list short (4–5 items); a bottom bar can't hold the full
 * rail menu.
 */
export interface BottomNavItem {
  /** Visible label under the icon. */
  label: string
  /** Icon name; resolved from the active IconProvider pack. */
  icon: IconName
  /** Link target. Plain `<a>` navigation, same idiom as AppRail. */
  href: string
}

interface AppShellBottomNavProps {
  /** Ordered nav items. */
  items: BottomNavItem[]
  /**
   * Current route path. The item whose `href` is the longest prefix of
   * this path renders active. Pass `usePathname()` from a client
   * parent — the block stays router-agnostic.
   */
  currentPath?: string
  className?: string
}

/**
 * Longest-prefix active match — mirrors AppRail's behaviour so the
 * bottom bar and the rail agree on the active section.
 */
function activeHrefFor(
  items: BottomNavItem[],
  currentPath: string | undefined,
): string | null {
  if (!currentPath) return null
  let best: string | null = null
  for (const item of items) {
    const h = item.href
    const matches =
      currentPath === h || currentPath.startsWith(h.endsWith("/") ? h : `${h}/`)
    if (matches && (best === null || h.length > best.length)) best = h
  }
  return best
}

/**
 * Mobile bottom navigation for the AppShell `bottomNav` slot — wires
 * the `navigation-bottom-mobile` component (fixed bottom bar,
 * safe-area aware) to plain-`<a>` nav items with longest-prefix active
 * state. The AppShell renders the slot only below `md`.
 */
export function AppShellBottomNav({
  items,
  currentPath,
  className,
}: AppShellBottomNavProps) {
  const icons = useIcons()
  const activeHref = activeHrefFor(items, currentPath)
  return (
    <NavigationBottomMobile value={activeHref} className={className}>
      <NavigationBottomMobileList>
        {items.map((item) => {
          const Icon = icons[item.icon]
          return (
            <NavigationBottomMobileItem
              key={item.href}
              value={item.href}
              asChild
            >
              <a href={item.href}>
                <NavigationBottomMobileItemIcon>
                  {Icon ? <Icon className="size-5" /> : null}
                </NavigationBottomMobileItemIcon>
                <NavigationBottomMobileItemLabel>
                  {item.label}
                </NavigationBottomMobileItemLabel>
              </a>
            </NavigationBottomMobileItem>
          )
        })}
      </NavigationBottomMobileList>
    </NavigationBottomMobile>
  )
}
