import type {
  BetaImportDataset,
  BetaImportSource,
  BetaImportStatus,
} from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Czech display labels for the import spine's three enums — the twin of
 * `lib/filing-labels.ts` and `lib/asset-labels.ts`, and here for the same
 * reason: an enum value is an English identifier in a Czech product, the
 * mapping is needed on both sides of the client boundary (the completeness
 * matrix renders on the server, the confirm dialogs in the browser), and a
 * `server-only` module could not be imported by the second.
 *
 * `satisfies Record<...>` on each map is the guard that matters: a value added
 * to a pgEnum in a later migration is a TYPE ERROR here until it has a Czech
 * label, rather than a raw `saldokonto` appearing on an office screen.
 */

export const IMPORT_DATASET_LABEL_KEY = {
  predvaha: "uzaverka.datasetPredvaha",
  rozvaha: "uzaverka.datasetRozvaha",
  vzz: "uzaverka.datasetVzz",
  saldokonto: "uzaverka.datasetSaldokonto",
  payroll: "uzaverka.datasetPayroll",
} as const satisfies Record<BetaImportDataset, BetaMessageKey>

export const IMPORT_STATUS_LABEL_KEY = {
  draft: "uzaverka.statusDraft",
  published: "uzaverka.statusPublished",
  superseded: "uzaverka.statusSuperseded",
} as const satisfies Record<BetaImportStatus, BetaMessageKey>

export const IMPORT_SOURCE_LABEL_KEY = {
  agent: "uzaverka.sourceAgent",
  manual: "uzaverka.sourceManual",
} as const satisfies Record<BetaImportSource, BetaMessageKey>
