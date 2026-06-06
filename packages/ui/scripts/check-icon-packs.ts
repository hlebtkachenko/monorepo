#!/usr/bin/env tsx
/**
 * Parity check for the icon-pack system.
 *
 * Each pack under `src/icon-packs/<name>/index.ts` exports a
 * `<name>Icons` const that must satisfy `IconMap` from
 * `src/icon-packs/types.ts`. This script verifies:
 *
 *   1. Every name in `ICON_NAMES` (from `types.ts`) exists as a key
 *      in every installed pack.
 *   2. No pack contains an unexpected extra key.
 *
 * The first check is also enforced at compile time by `satisfies
 * IconMap`, but a pack file that's accidentally not built / not
 * imported would silently drift. This runtime check guards against
 * that — wire into `pnpm lint` or a dedicated GitHub Actions step.
 *
 * Exit code 0 on parity, 1 on any drift.
 */

import { ICON_NAMES, type IconMap } from "../src/icon-packs/types"
import { fontawesomeIcons } from "../src/icon-packs/fontawesome"
import { lucideIcons } from "../src/icon-packs/lucide"
import { phosphorIcons } from "../src/icon-packs/phosphor"

interface Pack {
  name: string
  icons: IconMap
}

const packs: Pack[] = [
  { name: "lucide", icons: lucideIcons },
  { name: "phosphor", icons: phosphorIcons },
  { name: "fontawesome", icons: fontawesomeIcons },
]

let failed = false
const canonical = new Set<string>(ICON_NAMES)

for (const pack of packs) {
  const packKeys = new Set(Object.keys(pack.icons))

  const missing: string[] = []
  for (const name of canonical) {
    if (!packKeys.has(name)) missing.push(name)
  }

  const extra: string[] = []
  for (const key of packKeys) {
    if (!canonical.has(key)) extra.push(key)
  }

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✓ pack "${pack.name}" — ${packKeys.size} icons, parity ok`)
    continue
  }

  failed = true
  console.error(`✗ pack "${pack.name}" drift:`)
  if (missing.length > 0) {
    console.error(`  missing (${missing.length}):`)
    for (const name of missing) console.error(`    - ${name}`)
  }
  if (extra.length > 0) {
    console.error(`  unexpected extras (${extra.length}):`)
    for (const name of extra) console.error(`    + ${name}`)
  }
}

if (failed) {
  console.error("\nIcon pack parity check failed.")
  console.error("Every pack must export exactly the names in ICON_NAMES.")
  process.exit(1)
}

console.log("\nAll packs in parity.")
