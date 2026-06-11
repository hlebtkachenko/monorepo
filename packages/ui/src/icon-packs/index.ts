export { IconProvider, useIcons, useIconPack } from "./icon-context"
// Only the default (statically bundled) pack is re-exported here.
// phosphor/fontawesome are code-split behind dynamic import() in
// icon-context.tsx — a static re-export would pull them back into the
// shared bundle. Import them from "./phosphor" / "./fontawesome"
// directly (as scripts/check-icon-packs.ts does) if you need the maps.
export { lucideIcons } from "./lucide"
export { ICON_NAMES } from "./types"
export type { IconComponent, IconMap, IconName, IconPackName } from "./types"
