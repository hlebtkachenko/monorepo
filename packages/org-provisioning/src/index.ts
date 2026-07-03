/**
 * @workspace/org-provisioning — the organization creation-scaffolding protocol.
 *
 * One callable process (`scaffoldOrganization`) that mints a fully-configured,
 * ready-to-book účetní jednotka: identity + owner membership + first accounting
 * period + chart (seeded from the směrná osnova) + number series + self-
 * counterparty + VAT status + peněžní-deník categories, all in one atomic,
 * idempotent transaction. Composes @workspace/db (platform + tenancy) and
 * @workspace/accounting (domain master-data). `prefillFromRegistries`
 * (@workspace/registries) supplies SUGGESTED inputs; the orchestrator itself
 * performs no HTTP.
 *
 * Callers: onboarding (platform), the create-org wizard (UI), and — once
 * workspace-scoped API keys exist — POST /v1/organizations + an MCP tool.
 */

export { scaffoldOrganization, type ScaffoldResult } from "./scaffold"
export {
  ScaffoldInput,
  type ScaffoldInputRaw,
  type ScaffoldAddress,
} from "./input"
export { slugify, isReservedSlug, RESERVED_SLUGS } from "./slug"
export {
  deriveRegime,
  assertRegimeAllowed,
  assertRegimeVatCompatible,
  type Regime,
  type VatRegime,
  type LegalFormFacts,
  type RegimeDerivation,
} from "./regime"
export { derivePeriodBounds, type PeriodBounds } from "./period"
export {
  prefillFromRegistries,
  type PrefillOptions,
  type PrefillResult,
} from "./prefill"
export { ScaffoldValidationError, type ScaffoldErrorCode } from "./errors"
