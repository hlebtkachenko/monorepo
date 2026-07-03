/**
 * @workspace/registries — Czech public-registry lookups (ARES + CRPDPH).
 *
 * Pure fetch + Zod, ZERO workspace dependencies (no db, no accounting). The
 * lookups produce SUGGESTED scaffold inputs; the org-provisioning orchestrator
 * never calls this package — a caller (UI wizard, onboarding, agent) does the
 * lookup, the human/agent confirms, and the confirmed data flows into the
 * orchestrator as plain input. That is what makes "ARES is down" a non-event.
 */

export {
  lookupAres,
  normalizeAresResponse,
  type AresLookupOptions,
} from "./ares"
export {
  lookupVatRegistry,
  parseCrpdphResponse,
  buildCrpdphEnvelope,
  bareTaxNumber,
  type VatLookupOptions,
} from "./dph"
export { legalFormCodeFromCsu, personKindFromCsu } from "./csu-legal-form"
export {
  AresProfile,
  AresAddress,
  PersonKind,
  VatRegistryResult,
  VatBankAccount,
  RegistryLookupError,
} from "./types"
