import type {
  BetaAssetCategory,
  BetaAssetEventKind,
  BetaAssetStatus,
} from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Majetek display labels — the enum-to-Czech-string maps for `lib/data/assets.ts`
 * views, mirroring `lib/role-labels.ts`'s `ORG_ROLE_LABEL_KEY`.
 *
 * `satisfies Record<...>` makes a new enum value a compile error here rather
 * than a blank cell in the Přehled majetku table or the Karta.
 */

export const ASSET_CATEGORY_LABEL_KEY = {
  machine: "majetek.categoryMachine",
  vehicle: "majetek.categoryVehicle",
  tool: "majetek.categoryTool",
  real_estate: "majetek.categoryRealEstate",
  other: "majetek.categoryOther",
} as const satisfies Record<BetaAssetCategory, BetaMessageKey>

export const ASSET_STATUS_LABEL_KEY = {
  in_use: "majetek.statusInUse",
  disposed: "majetek.statusDisposed",
} as const satisfies Record<BetaAssetStatus, BetaMessageKey>

export const ASSET_EVENT_KIND_LABEL_KEY = {
  put_into_service: "majetek.eventKindPutIntoService",
  improvement: "majetek.eventKindImprovement",
  disposal: "majetek.eventKindDisposal",
} as const satisfies Record<BetaAssetEventKind, BetaMessageKey>
