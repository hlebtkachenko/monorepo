"use client"

import * as React from "react"

import { lucideIcons } from "./lucide"
import type { IconMap, IconPackName } from "./types"

const DEFAULT_PACK: IconPackName = "lucide"
const STORAGE_KEY = "afframe-icon-pack"

type LazyPackName = Exclude<IconPackName, "lucide">

/**
 * Registered icon packs. Lucide is the default pack and ships statically
 * in the shared bundle; every other pack loads on demand via dynamic
 * `import()` so its icon library stays out of the first-load JS (WP-01).
 *
 * Add a new pack:
 *   1. Create `packages/ui/src/icon-packs/<pack>/index.ts(x)` exporting
 *      `<pack>Icons` with `satisfies IconMap`.
 *   2. Add a loader entry below.
 *   3. Add the literal name to `IconPackName` in `./types`.
 *   4. `pnpm check:icon-packs` enforces parity in CI.
 */
const LAZY_PACK_LOADERS: Record<LazyPackName, () => Promise<IconMap>> = {
  phosphor: () => import("./phosphor").then((m) => m.phosphorIcons),
  fontawesome: () => import("./fontawesome").then((m) => m.fontawesomeIcons),
}

// Module-level cache: each pack's chunk is fetched once per session;
// later provider mounts and re-switches resolve synchronously.
const loadedPacks: Partial<Record<IconPackName, IconMap>> = {
  lucide: lucideIcons,
}

function isPackName(value: string): value is IconPackName {
  return value === DEFAULT_PACK || Object.hasOwn(LAZY_PACK_LOADERS, value)
}

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
 *
 * Non-default packs are code-split: switching to one (or hydrating a
 * stored choice) fetches its chunk first, then swaps `pack` + icon map
 * atomically. Until the chunk resolves the current pack keeps
 * rendering — the default lucide pack never flashes or re-renders.
 */
export function IconProvider({
  defaultPack = DEFAULT_PACK,
  storageKey = STORAGE_KEY,
  children,
}: IconProviderProps) {
  const [active, setActive] = React.useState<{
    pack: IconPackName
    icons: IconMap
  }>(() => {
    const cached = loadedPacks[defaultPack]
    return cached
      ? { pack: defaultPack, icons: cached }
      : { pack: DEFAULT_PACK, icons: lucideIcons }
  })

  // Latest pack the user (or hydration) asked for — guards against a
  // slow chunk resolving after a newer switch already won.
  const requestedPack = React.useRef<IconPackName>(active.pack)

  const activate = React.useCallback((next: IconPackName) => {
    requestedPack.current = next
    const cached = loadedPacks[next]
    if (cached) {
      setActive((prev) =>
        prev.pack === next ? prev : { pack: next, icons: cached },
      )
      return
    }
    void LAZY_PACK_LOADERS[next as LazyPackName]()
      .then((icons) => {
        loadedPacks[next] = icons
        if (requestedPack.current === next) {
          setActive((prev) =>
            prev.pack === next ? prev : { pack: next, icons },
          )
        }
      })
      .catch(() => {
        // Chunk fetch failed (offline, deploy skew) — keep the current pack.
      })
  }, [])

  // Hydrate from localStorage after mount (avoid SSR mismatch). A stored
  // non-default pack loads lazily; the default pack is a no-op (the
  // functional setState bails out, so no extra render).
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(storageKey)
    const wanted = stored && isPackName(stored) ? stored : defaultPack
    activate(wanted)
  }, [storageKey, defaultPack, activate])

  const setPack = React.useCallback(
    (next: IconPackName) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next)
      }
      activate(next)
    },
    [storageKey, activate],
  )

  const packContext = React.useMemo(
    () => ({ pack: active.pack, setPack }),
    [active.pack, setPack],
  )

  return (
    <IconPackContext.Provider value={packContext}>
      <IconMapContext.Provider value={active.icons}>
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
