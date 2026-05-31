"use client"

import * as React from "react"

import { fontawesomeIcons } from "./fontawesome"
import { lucideIcons } from "./lucide"
import { phosphorIcons } from "./phosphor"
import type { IconMap, IconPackName } from "./types"

/**
 * Registered icon packs. Add a new pack:
 *   1. Create `packages/ui/src/icon-packs/<pack>/index.ts` exporting
 *      `<pack>Icons` with `satisfies IconMap`.
 *   2. Add the import + entry below.
 *   3. Add the literal name to `IconPackName` in `./types`.
 *   4. `pnpm check:icon-packs` enforces parity in CI.
 */
const PACKS: Record<IconPackName, IconMap> = {
  lucide: lucideIcons,
  phosphor: phosphorIcons,
  fontawesome: fontawesomeIcons,
}

const DEFAULT_PACK: IconPackName = "lucide"
const STORAGE_KEY = "afframe-icon-pack"

interface IconPackContextValue {
  pack: IconPackName
  setPack: (next: IconPackName) => void
}

// Default `null` so a missing provider is a loud failure, not a
// silent fallback. Stories + tests must wrap with `<IconProvider>`
// (or a thin test helper) — see `app-rail.stories.tsx` for the
// decorator pattern.
const IconMapContext = React.createContext<IconMap | null>(null)
const IconPackContext = React.createContext<IconPackContextValue | null>(null)

interface IconProviderProps {
  /** Pack to use on first render — typically passed from a cookie
   *  read on the server to avoid hydration flashes. */
  defaultPack?: IconPackName
  /** localStorage key. Override to scope per-app. */
  storageKey?: string
  children: React.ReactNode
}

/**
 * Wraps a subtree so every `useIcons()` consumer below reads from
 * the active pack. Persists the user's choice in localStorage; the
 * default is hydrated from `defaultPack` (which a parent server
 * layout can derive from a cookie if you want zero-flash SSR).
 */
export function IconProvider({
  defaultPack = DEFAULT_PACK,
  storageKey = STORAGE_KEY,
  children,
}: IconProviderProps) {
  const [pack, setPackState] = React.useState<IconPackName>(defaultPack)

  // Hydrate from localStorage after mount (avoid SSR mismatch).
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(storageKey)
    if (stored && stored in PACKS) {
      setPackState(stored as IconPackName)
    }
  }, [storageKey])

  const setPack = React.useCallback(
    (next: IconPackName) => {
      setPackState(next)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next)
      }
    },
    [storageKey],
  )

  const packContext = React.useMemo(() => ({ pack, setPack }), [pack, setPack])

  return (
    <IconPackContext.Provider value={packContext}>
      <IconMapContext.Provider value={PACKS[pack]}>
        {children}
      </IconMapContext.Provider>
    </IconPackContext.Provider>
  )
}

/**
 * Returns the active pack's full icon map. Destructure the names you
 * need:
 *   ```tsx
 *   const { Home, Settings } = useIcons()
 *   return <Home className="size-5" />
 *   ```
 *
 * Throws if called outside an `<IconProvider>` — wrap your tree (or,
 * for Storybook stories, use the `IconProvider` decorator).
 */
export function useIcons(): IconMap {
  const map = React.useContext(IconMapContext)
  if (!map) {
    throw new Error(
      "useIcons() must be called inside an <IconProvider>. " +
        "The root layout mounts one; tests/stories should wrap with " +
        "<IconProvider> too.",
    )
  }
  return map
}

/**
 * Returns the active pack name + a setter for swapping packs. Use
 * in a settings UI to expose the toggle.
 */
export function useIconPack(): IconPackContextValue {
  const value = React.useContext(IconPackContext)
  if (!value) {
    throw new Error("useIconPack() must be called inside an <IconProvider>.")
  }
  return value
}
