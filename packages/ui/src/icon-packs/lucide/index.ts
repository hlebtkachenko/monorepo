import * as Lucide from "lucide-react"

import { ICON_NAMES, type IconMap, type IconName } from "../types"

/**
 * Lucide icon pack — the default pack, derived from the canonical
 * `ICON_NAMES` list against the `lucide-react` namespace rather than a
 * hand-maintained 1:1 literal. Every `IconName` resolves to the
 * identically-named `lucide-react` export (no renames needed).
 *
 * `LucidePack` preserves the compile-time guarantee the old
 * `satisfies IconMap` literal gave: if `lucide-react` ever drops or renames
 * an export that `ICON_NAMES` still lists, `(typeof Lucide)[K]` becomes a
 * type error here, so a missing icon cannot slip through as `undefined`.
 * The `: IconMap` annotation keeps every entry a valid icon component, and
 * the runtime parity gate (`pnpm check:icon-packs`) is unchanged.
 */
type LucidePack = { [K in IconName]: (typeof Lucide)[K] }

export const lucideIcons: IconMap = Object.fromEntries(
  ICON_NAMES.map((name) => [name, Lucide[name as keyof typeof Lucide]]),
) as LucidePack
