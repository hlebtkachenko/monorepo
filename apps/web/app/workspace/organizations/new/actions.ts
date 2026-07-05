"use server"

import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import {
  scaffoldOrganization,
  prefillFromRegistries,
  ScaffoldValidationError,
} from "@workspace/org-provisioning"

import { logServerError } from "../../../../lib/log-server-error"
import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "../../_lib/workspace-context"
import { OrgWizardSchema, type OrgWizardInput } from "../_lib/wizard-schema"
import { buildScaffoldInput } from "../_lib/build-scaffold-input"

export interface PrefillResultDto {
  ok: boolean
  suggestion?: Partial<OrgWizardInput>
  warnings?: string[]
  errorKey?: string
}

export interface CreateOrgResult {
  ok: boolean
  slug?: string
  errorKey?: string
}

async function getActiveUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

/**
 * Look up ARES + the DPH registry for an IČO and return SUGGESTED wizard
 * values. Runs server-side (keeps registry calls off the browser). A registry
 * failure returns warnings, never throws — the user falls back to manual entry.
 */
export async function prefillOrgAction(ico: string): Promise<PrefillResultDto> {
  if (!/^\d{8}$/.test(ico)) {
    return { ok: false, errorKey: "invalidIco" }
  }
  const userId = await getActiveUserId()
  if (!userId) return { ok: false, errorKey: "sessionExpired" }

  // Registries can hang (adisspr.mfcr.cz accepts and never answers) — cap the
  // whole prefill; an abort degrades to a warning inside prefillFromRegistries.
  const { suggestion, warnings } = await prefillFromRegistries({
    ico,
    signal: AbortSignal.timeout(8000),
  })
  const address = suggestion.address
  return {
    ok: true,
    warnings,
    suggestion: {
      ico: suggestion.ico ?? undefined,
      legalName: suggestion.legalName ?? undefined,
      legalFormCode: suggestion.legalFormCode ?? undefined,
      personKind: suggestion.personKind ?? undefined,
      inPublicRegister: suggestion.inPublicRegister ?? undefined,
      dic: suggestion.dic ?? "",
      registeredAt: suggestion.registeredAt ?? "",
      businessActivityCodes: suggestion.businessActivityCodes ?? [],
      vatRegimeCode: suggestion.vatRegimeCode ?? undefined,
      vatFilingPeriod: suggestion.vatFilingPeriod ?? undefined,
      street: address?.street ?? "",
      houseNumber: address?.houseNumber ?? "",
      orientationNumber: address?.orientationNumber ?? "",
      city: address?.city ?? "",
      postalCode: address?.postalCode ?? "",
      region: address?.region ?? "",
      countryCode: address?.countryCode ?? "",
      taxOfficeCode: suggestion.taxOfficeCode ?? "",
      registryFileNumber: suggestion.registryFileNumber ?? "",
      deliveryAddressLines: suggestion.deliveryAddressLines ?? [],
    },
  }
}

/**
 * Scaffold a new organization in the caller's active/owned workspace. The
 * workspace + owner are resolved server-side (never accepted from the client).
 * `idempotencyKey` is the wizard-session key so a retry replays.
 * `requireWorkspaceRole` restricts this mutation to `owner`/`admin`; a
 * `member` may not scaffold a new organization (consistent with the
 * owner/admin-only archive gate in `../actions.ts`).
 */
export async function createOrgAction(
  values: OrgWizardInput,
  idempotencyKey: string,
): Promise<CreateOrgResult> {
  const parsed = OrgWizardSchema.safeParse(values)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
    return { ok: false, errorKey: "invalidInput" }
  }

  const userId = await getActiveUserId()
  if (!userId) return { ok: false, errorKey: "sessionExpired" }
  const ctx = await getWorkspaceContext(userId)
  if (!ctx.activeWorkspaceId) {
    return { ok: false, errorKey: "noActiveWorkspace" }
  }
  const workspaceId = ctx.activeWorkspaceId

  const roleError = requireWorkspaceRole(ctx, ["owner", "admin"])
  if (roleError) return roleError

  try {
    const result = await scaffoldOrganization(
      buildScaffoldInput(parsed.data, {
        workspaceId,
        ownerUserId: userId,
        idempotencyKey,
      }),
    )
    return { ok: true, slug: result.slug }
  } catch (err) {
    if (err instanceof ScaffoldValidationError) {
      return { ok: false, errorKey: err.code }
    }
    logServerError("createOrgAction scaffold failed", err)
    return { ok: false, errorKey: "createFailed" }
  }
}
