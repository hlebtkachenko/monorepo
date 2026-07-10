// Cluster — group corrections that share a signature (same counterparty/direction/supply_kind/
// jurisdiction, the same facts a booking treatment is decided on). One cluster is one candidate
// rule's worth of evidence.

import type { CorrectionRecord } from "./correction"
import { type CorrectionSignature, signatureKey } from "./signature"

export interface CorrectionCluster {
  signature: CorrectionSignature
  corrections: CorrectionRecord[]
}

/** Groups records by exact signature match. Order-preserving (first-seen signature order); does
 * not sort or drop anything — a cluster of size 1 is still returned (distillation decides the
 * minimum evidence bar, not clustering). */
export function clusterCorrections(
  records: readonly CorrectionRecord[],
): CorrectionCluster[] {
  const order: string[] = []
  const bySignature = new Map<string, CorrectionCluster>()
  for (const record of records) {
    const key = signatureKey(record.signature)
    let cluster = bySignature.get(key)
    if (!cluster) {
      cluster = { signature: record.signature, corrections: [] }
      bySignature.set(key, cluster)
      order.push(key)
    }
    cluster.corrections.push(record)
  }
  return order.map((key) => bySignature.get(key)!)
}
