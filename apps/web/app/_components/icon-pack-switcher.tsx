"use client"

import { useIconPack } from "@workspace/ui/icon-packs"
import type { IconPackName } from "@workspace/ui/icon-packs"

const PACKS: IconPackName[] = ["lucide", "phosphor", "fontawesome"]

/**
 * Temporary debug control for visually verifying the icon-pack swap.
 * Remove once the proper settings UI ships.
 */
export function IconPackSwitcher() {
  const { pack, setPack } = useIconPack()
  return (
    <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-md">
      <span className="text-xs text-foreground/70">Icon pack:</span>
      <select
        value={pack}
        onChange={(e) => setPack(e.target.value as IconPackName)}
        className="rounded-sm border bg-transparent px-2 py-1 text-xs font-medium capitalize"
      >
        {PACKS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  )
}
