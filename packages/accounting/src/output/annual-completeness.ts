export type AnnualArtifactCompleteness = {
  status: "WORKSHEET_READY" | "NEEDS_INPUT" | "DRAFT"
  filingReady: false
  blockingInputs: string[]
  unsupportedRequirements: string[]
}

export type AdjustmentProvenance = {
  source: "USER" | "ADVISOR" | "LEDGER"
  reference: string
  recordedAt: string
}

export type ProvenancedDecimal = {
  amount: string
  provenance: AdjustmentProvenance
}
