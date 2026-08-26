import type {
  BetaFilingFamily,
  BetaFilingKind,
  BetaFilingStatus,
} from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Daně a podání's Czech labels for the filing registry's three enums —
 * `family`, `kind`, `status` — the client-facing twin of `role-labels.ts`.
 *
 * `satisfies Record<Enum, BetaMessageKey>` makes a new enum value a compile
 * error here rather than a blank cell: `db/schema-drift.test.ts` already
 * fails the build the day a migration adds one, and this is what fails it a
 * second time if the label is forgotten.
 */
export const FILING_FAMILY_LABEL_KEY = {
  dph: "dane.familyDph",
  dan_z_prijmu: "dane.familyDanZPrijmu",
  mzdove_odvody: "dane.familyMzdoveOdvody",
  ostatni: "dane.familyOstatni",
} as const satisfies Record<BetaFilingFamily, BetaMessageKey>

export const FILING_KIND_LABEL_KEY = {
  dph_priznani: "dane.kindDphPriznani",
  dph_kontrolni_hlaseni: "dane.kindDphKontrolniHlaseni",
  dph_souhrnne_hlaseni: "dane.kindDphSouhrnneHlaseni",
  dppo_priznani: "dane.kindDppoPriznani",
  dppo_zaloha: "dane.kindDppoZaloha",
  ucetni_zaverka: "dane.kindUcetniZaverka",
  vyuctovani_dane: "dane.kindVyuctovaniDane",
  prehled_cssz: "dane.kindPrehledCssz",
  prehled_zp: "dane.kindPrehledZp",
  jmhz: "dane.kindJmhz",
  silnicni_dan: "dane.kindSilnicniDan",
  ostatni: "dane.kindOstatni",
} as const satisfies Record<BetaFilingKind, BetaMessageKey>

export const FILING_STATUS_LABEL_KEY = {
  planned: "dane.statusPlanned",
  filed: "dane.statusFiled",
  confirmed: "dane.statusConfirmed",
  corrective: "dane.statusCorrective",
} as const satisfies Record<BetaFilingStatus, BetaMessageKey>
