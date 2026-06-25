#!/usr/bin/env node
// Guards the `ui-belongs-in-packages-ui-blocks` convention (CLAUDE.md):
// reusable UI compositions live in packages/ui/src/blocks (or components);
// apps/web is for app-specific surfaces + thin data wrappers only.
//
// Two checks on the staged apps/web files passed as argv:
//   1. HARD BLOCK — any new file under apps/web/components/** (except the
//      reserved debug/ side-effect surface). That directory is reserved; a
//      reusable composition landing there can't be shared with apps/admin or
//      other pages. This is the historically-real regression (asuncion-v2).
//   2. SOFT WARN — a data-layer file under app/_components/** that ships heavy
//      reusable interaction (native drag, pointer-capture, or arrow-key
//      navigation) is probably a generic primitive in the wrong place. Warn,
//      don't block: a precise "is this generic?" test isn't mechanical, so the
//      _components data layer stays review-enforced — this is just a nudge.
import { readFileSync } from "node:fs"

const files = process.argv.slice(2).filter(Boolean)

const RESERVED = /^apps\/web\/components\//
const RESERVED_ALLOW = /^apps\/web\/components\/(debug\/|\.gitkeep$)/
const blocked = files.filter(
  (f) => RESERVED.test(f) && !RESERVED_ALLOW.test(f) && /\.(t|j)sx?$/.test(f),
)

// Precise signals — native DnD, pointer-drag, or arrow-key handling. NOT a bare
// "Arrow" (that matches icon names like ArrowUpRight).
const PRIMITIVE_SIGNALS =
  /\bdraggable\b|onDragStart|setPointerCapture|\.key === "Arrow|\.key\.startsWith\("Arrow|case "Arrow/
const suspects = []
for (const f of files) {
  if (!/\/_components\//.test(f) || !/\.tsx?$/.test(f)) continue
  try {
    if (PRIMITIVE_SIGNALS.test(readFileSync(f, "utf8"))) suspects.push(f)
  } catch {
    // File staged for deletion / unreadable — skip.
  }
}

if (suspects.length > 0) {
  console.warn(
    "\n[ui-location] WARNING — these app-local files implement reusable interaction\n" +
      "(drag / pointer-capture / keyboard nav). If generic, move them to\n" +
      "packages/ui so other pages + apps/admin can reuse them:\n" +
      suspects.map((f) => `  - ${f}`).join("\n") +
      "\n",
  )
}

if (blocked.length > 0) {
  console.error(
    "\n[ui-location] BLOCKED — reusable UI cannot live under apps/web/components/.\n" +
      "Move it to packages/ui/src/blocks/<area>/ (import via @workspace/ui/blocks/<area>).\n" +
      "apps/web/components/ is reserved for app-specific Next side-effect surfaces (debug/).\n" +
      "See CLAUDE.md + docs/runbooks/APP-SHELL-PANELS.md.\n" +
      blocked.map((f) => `  - ${f}`).join("\n") +
      "\n",
  )
  process.exit(1)
}
