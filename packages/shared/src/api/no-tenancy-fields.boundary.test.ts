import { describe, expect, it } from "vitest"

import { buildOpenApiDocument } from "./registry"

/**
 * [I3] Boundary gate: "No tenancy fields in any tool/function input." The
 * enforcement surface here is the API request-schema — the Zod schemas in
 * `packages/shared/src/api/*.ts` accept DOMAIN fields only; tenancy is
 * injected server-side from the API-key principal (`@CurrentPrincipal()`),
 * never from the request body/query/params/headers. See
 * `packages/brain/.brain/constitution.md` §I3.
 *
 * This walks the SAME generated OpenAPI document (`buildOpenApiDocument()`)
 * the api process, the SDK codegen, and the MCP tool-schema codegen all
 * consume (`docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md` step 4 —
 * `pnpm gen:all`) — so ANY operation registered in `registry.ts` is
 * automatically covered, not just today's endpoint list. It checks only the
 * INPUT surface (request body / query / path / header parameters); response
 * schemas are out of scope by design (e.g. `GetOrganizationResponse`
 * legitimately echoes back the resolved `organizationId` — that is read-only
 * output, never a client-settable input).
 *
 * Scoped to operations that require the bearer (API-key) `security` scheme.
 * I3's premise is "the org is a property of the CREDENTIAL, not an input" —
 * an operation with no credential at all (`POST /v1/feedback`, `GET /v1/
 * status`, `GET /v1/structure*`) has no principal to leak tenancy from, so
 * the invariant is structurally vacuous there. This is not an ad hoc
 * allowlist: it is why `POST /v1/feedback`'s `context.element.role` (the
 * right-clicked DOM element's ARIA `role` attribute, from the in-app bug
 * reporter) must NOT trip this check — it is an unrelated HTML attribute on
 * a public, unauthenticated endpoint, not an authorization/tenancy role.
 */

const TENANCY_FIELDS = new Set([
  "organization_id",
  "user_id",
  "workspace_id",
  "role",
  "organizationId",
  "userId",
  "workspaceId",
])

interface JsonSchema {
  properties?: Record<string, JsonSchema>
  items?: JsonSchema | JsonSchema[]
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  $ref?: string
}

/** Resolve a `$ref` (always `#/components/schemas/<Name>` in this document) against the component map. */
function resolveRef(
  schema: JsonSchema,
  components: Record<string, JsonSchema>,
): JsonSchema {
  if (!schema.$ref) return schema
  const name = schema.$ref.replace("#/components/schemas/", "")
  const resolved = components[name]
  if (!resolved) throw new Error(`Unresolvable $ref: ${schema.$ref}`)
  return resolved
}

/**
 * Recursively collects every property name declared anywhere in `schema`
 * (nested objects, array items, union branches), resolving `$ref` against
 * `components`. `seen` guards a schema-graph cycle so a future recursive
 * type can never hang the check.
 */
function collectFieldNames(
  schema: JsonSchema | undefined,
  components: Record<string, JsonSchema>,
  seen: Set<JsonSchema> = new Set(),
): string[] {
  if (!schema) return []
  const resolved = resolveRef(schema, components)
  if (seen.has(resolved)) return []
  seen.add(resolved)

  const names: string[] = []
  if (resolved.properties) {
    for (const [key, value] of Object.entries(resolved.properties)) {
      names.push(key)
      names.push(...collectFieldNames(value, components, seen))
    }
  }
  if (resolved.items) {
    const items = Array.isArray(resolved.items)
      ? resolved.items
      : [resolved.items]
    for (const item of items) {
      names.push(...collectFieldNames(item, components, seen))
    }
  }
  for (const branch of [
    ...(resolved.anyOf ?? []),
    ...(resolved.oneOf ?? []),
    ...(resolved.allOf ?? []),
  ]) {
    names.push(...collectFieldNames(branch, components, seen))
  }
  return names
}

interface OpenApiParameter {
  name: string
  in: string
}

interface OpenApiOperation {
  parameters?: OpenApiParameter[]
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>
  }
  security?: unknown[]
}

describe("[I3] request/input schemas are tenancy-free (packages/shared/src/api)", () => {
  const doc = buildOpenApiDocument()
  const components = (doc.components?.schemas ?? {}) as Record<
    string,
    JsonSchema
  >
  const allPaths = (doc.paths ?? {}) as Record<
    string,
    Record<string, OpenApiOperation>
  >
  // Only principal-bound (bearer-secured) operations are in scope — see the
  // file header for why an unauthenticated op (no principal to leak
  // tenancy from) is structurally out of scope, not allowlisted.
  const paths: Record<string, Record<string, OpenApiOperation>> = {}
  for (const [p, methods] of Object.entries(allPaths)) {
    const secured = Object.fromEntries(
      Object.entries(methods).filter(
        ([, op]) => (op.security?.length ?? 0) > 0,
      ),
    )
    if (Object.keys(secured).length > 0) paths[p] = secured
  }

  it("scans the real registered surface (non-vacuous: at least one write op with a body)", () => {
    const writeOps = Object.values(paths).flatMap((methods) =>
      Object.values(methods).filter((op) => op.requestBody),
    )
    expect(writeOps.length).toBeGreaterThan(0)
  })

  it("excludes unauthenticated operations (POST /v1/feedback has no principal to scope)", () => {
    expect(paths["/v1/feedback"]).toBeUndefined()
    expect(paths["/v1/accounting/events"]).toBeDefined()
  })

  it("the field collector detects an injected tenancy field (the detector is real)", () => {
    const dirty: JsonSchema = {
      properties: {
        periodId: { properties: {} },
        organization_id: { properties: {} },
        nested: {
          properties: { userId: { properties: {} } },
        },
      },
    }
    const fields = collectFieldNames(dirty, {})
    expect(fields).toContain("organization_id")
    expect(fields).toContain("userId")
    // A clean schema yields no tenancy hits.
    const clean: JsonSchema = { properties: { periodId: {}, seriesId: {} } }
    const cleanFields = collectFieldNames(clean, {})
    expect(cleanFields.some((f) => TENANCY_FIELDS.has(f))).toBe(false)
  })

  it("no operation's parameters (query/path/header) declare a tenancy field", () => {
    const offenders: string[] = []
    for (const [p, methods] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(methods)) {
        for (const param of op.parameters ?? []) {
          if (TENANCY_FIELDS.has(param.name)) {
            offenders.push(
              `${method.toUpperCase()} ${p} :: param ${param.name}`,
            )
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("no operation's request body schema declares a tenancy field anywhere in its shape", () => {
    const offenders: string[] = []
    for (const [p, methods] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const bodySchema = op.requestBody?.content?.["application/json"]?.schema
        if (!bodySchema) continue
        const hits = [
          ...new Set(
            collectFieldNames(bodySchema, components).filter((f) =>
              TENANCY_FIELDS.has(f),
            ),
          ),
        ]
        if (hits.length > 0) {
          offenders.push(`${method.toUpperCase()} ${p} :: ${hits.join(", ")}`)
        }
      }
    }
    expect(
      offenders,
      `Request body schema(s) declare a tenancy field. Tenancy is injected ` +
        `server-side from the API-key principal (@CurrentPrincipal()) — never ` +
        `accepted as client input (constitution I3). Offenders: ${offenders.join(" | ")}`,
    ).toEqual([])
  })
})
