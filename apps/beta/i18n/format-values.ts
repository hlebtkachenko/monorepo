/**
 * COMPATIBILITY RE-EXPORT — the implementation lives in `@/lib/format/date`
 * now (item 38 final sweep, formatter consolidation). Every consumer has been
 * re-pointed there except `pro-ucetni/uzaverka/[batchId]/page.tsx`, which was
 * owned by a parallel in-flight lane at the time of this sweep and could not
 * be touched without colliding with it. Once that lane's PR lands, re-point
 * its import to `@/lib/format/date` and delete this file.
 */
export { formatDateTime } from "@/lib/format/date"
