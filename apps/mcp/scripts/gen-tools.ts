import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Generate one MCP tool registration file per OpenAPI operation.
 *
 * Reads the committed `apps/api/openapi/v1.json`, walks every
 * `paths[*][method]`, and emits `apps/mcp/src/tools/generated/<id>.ts` for
 * each `operationId`. The output uses the existing SDK client + render
 * helpers — no new transport, no new error envelope.
 *
 * The hand-curated `_curate.ts` lookup table layers per-operation
 * annotation tweaks (e.g. "this POST is destructive" or "this GET pages
 * with cursors"); the codegen merges those with method-derived defaults.
 *
 * The output dir is `linguist-generated=true` via `.gitattributes` — never
 * hand-edit. Drift between the spec and the committed tool files is gated
 * by `.github/workflows/mcp-coverage.yml`.
 */

interface JsonSchemaNode {
  $ref?: string
  type?: string | string[]
  enum?: unknown[]
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  items?: JsonSchemaNode
  description?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
}

interface Operation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  requestBody?: {
    content?: Record<string, { schema?: JsonSchemaNode }>
  }
}

interface Spec {
  paths?: Record<string, Record<string, Operation>>
  components?: { schemas?: Record<string, JsonSchemaNode> }
}

const ROOT = resolve(__dirname, "..", "..", "..")
const SPEC_PATH = resolve(ROOT, "apps/api/openapi/v1.json")
const OUT_DIR = resolve(ROOT, "apps/mcp/src/tools/generated")
const INDEX_PATH = resolve(OUT_DIR, "index.ts")
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const

function camelToSnake(camel: string): string {
  // Two-pass conversion so multi-character acronyms stay grouped:
  //   `getOrganization`   -> `get_organization`
  //   `listAPIKeys`       -> `list_api_keys`   (not `list_a_p_i_keys`)
  //   `parseEANCheckDigit`-> `parse_ean_check_digit`
  // First pass splits acronym-then-Capital boundaries; second pass splits
  // lower-then-Capital boundaries. Final lowercase emits the tool name.
  return camel
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase()
}

function escape(text: string): string {
  return text.replace(/[`\\]/g, "\\$&").replace(/\$\{/g, "\\${")
}

/**
 * Resolve a `#/components/schemas/<Name>` $ref against the spec. Returns
 * the ref name + target node, or null for inline/missing schemas.
 */
function resolveRef(
  node: JsonSchemaNode,
  spec: Spec,
): { name: string; target: JsonSchemaNode } | null {
  if (!node.$ref) return null
  const name = node.$ref.replace("#/components/schemas/", "")
  const target = spec.components?.schemas?.[name]
  return target ? { name, target } : null
}

/**
 * Emit a Zod v4 expression for an OpenAPI 3.1 JSON-Schema node — the
 * subset zod-to-openapi produces from our registry (string/enum/number/
 * boolean/array/object, `["T","null"]` nullability, length/range bounds,
 * descriptions, `$ref`s into components.schemas). Anything outside the
 * subset degrades to `z.unknown()` — the api re-validates every body
 * server-side, so the MCP-side schema is a usability layer for the LLM,
 * not the enforcement boundary.
 */
function zodExprFor(
  node: JsonSchemaNode,
  spec: Spec,
  seen: ReadonlySet<string> = new Set(),
): string {
  const ref = resolveRef(node, spec)
  if (node.$ref) {
    if (!ref || seen.has(ref.name)) return "z.unknown()"
    return zodExprFor(ref.target, spec, new Set([...seen, ref.name]))
  }
  const types = Array.isArray(node.type)
    ? node.type
    : node.type
      ? [node.type]
      : []
  const nullable = types.includes("null")
  const base = types.find((t) => t !== "null")
  const enumValues = node.enum?.filter((v) => v !== null)
  let expr: string
  if (
    enumValues &&
    enumValues.length > 0 &&
    enumValues.every((v) => typeof v === "string")
  ) {
    expr = `z.enum(${JSON.stringify(enumValues)})`
  } else if (base === "string") {
    expr = "z.string()"
    if (typeof node.minLength === "number") expr += `.min(${node.minLength})`
    if (typeof node.maxLength === "number") expr += `.max(${node.maxLength})`
  } else if (base === "number" || base === "integer") {
    expr = base === "integer" ? "z.number().int()" : "z.number()"
    if (typeof node.minimum === "number") expr += `.min(${node.minimum})`
    if (typeof node.maximum === "number") expr += `.max(${node.maximum})`
  } else if (base === "boolean") {
    expr = "z.boolean()"
  } else if (base === "array") {
    expr = `z.array(${node.items ? zodExprFor(node.items, spec, seen) : "z.unknown()"})`
  } else if (base === "object" || node.properties) {
    const props = node.properties ?? {}
    const required = new Set(node.required ?? [])
    const entries = Object.entries(props).map(([key, child]) => {
      let propExpr = zodExprFor(child, spec, seen)
      if (!required.has(key)) propExpr += ".optional()"
      return `${JSON.stringify(key)}: ${propExpr}`
    })
    expr = entries.length
      ? `z.object({ ${entries.join(", ")} })`
      : "z.record(z.string(), z.unknown())"
  } else {
    expr = "z.unknown()"
  }
  if (nullable) expr += ".nullable()"
  if (node.description) expr += `.describe(${JSON.stringify(node.description)})`
  return expr
}

interface RequestBodyInfo {
  /** Component name when the body schema is a `$ref` (the common case). */
  refName: string | null
  /** `const inputShape = {...}` source block (Zod raw shape). */
  shapeSource: string
}

/**
 * Build the MCP `inputSchema` raw-shape source for an operation's JSON
 * request body. Returns null when the operation has no JSON body.
 */
function buildRequestBodyInfo(
  op: Operation,
  spec: Spec,
): RequestBodyInfo | null {
  const bodySchema = op.requestBody?.content?.["application/json"]?.schema
  if (!bodySchema) return null
  const ref = resolveRef(bodySchema, spec)
  const resolved = ref?.target ?? bodySchema
  const required = new Set(resolved.required ?? [])
  const props = Object.entries(resolved.properties ?? {})
  const lines = props.map(([key, child]) => {
    let expr = zodExprFor(child, spec, ref ? new Set([ref.name]) : new Set())
    if (!required.has(key)) expr += ".optional()"
    return `  ${JSON.stringify(key)}: ${expr},`
  })
  return {
    refName: ref?.name ?? null,
    shapeSource: ["const inputShape = {", ...lines, "}"].join("\n"),
  }
}

function clientCallFor(method: string, path: string, hasBody: boolean): string {
  // The codegen targets the openapi-fetch `client.GET/POST(...)` surface
  // exported by `@afframe/sdk` (`createAfframeClient`). Emit the path as a
  // bare string literal — TS narrows it to its literal type and openapi-
  // fetch's `PathsWithMethod` accepts the match. No `as never` cast: that
  // would defeat the path typing the generated types exist to provide.
  const verb = method.toUpperCase()
  return hasBody
    ? `client.${verb}("${path}", { body })`
    : `client.${verb}("${path}")`
}

function emitTool(
  operationId: string,
  method: string,
  path: string,
  op: Operation,
  spec: Spec,
): string {
  const description =
    op.description ?? op.summary ?? `Wraps ${method.toUpperCase()} ${path}.`
  const body = buildRequestBodyInfo(op, spec)
  // The MCP SDK validates tool arguments against `inputShape` before the
  // handler runs; the cast bridges the zod-inferred argument type to the
  // spec-generated body type for openapi-fetch.
  const bodyType = body
    ? body.refName
      ? `components["schemas"][${JSON.stringify(body.refName)}]`
      : "Record<string, unknown>"
    : null
  const sdkImport = body
    ? 'import type { AfframeClient, components } from "@afframe/sdk"'
    : 'import type { AfframeClient } from "@afframe/sdk"'
  const zodImport = body ? 'import { z } from "zod"\n' : ""
  const shapeBlock = body ? `\n${body.shapeSource}\n` : ""
  const inputSchemaLine = body ? "\n      inputSchema: inputShape," : ""
  const handlerParams = body ? "args" : ""
  const handlerPrelude = body
    ? `\n        const body = args as unknown as ${bodyType}`
    : ""
  return `// AUTO-GENERATED by apps/mcp/scripts/gen-tools.ts — do not edit.
${zodImport}${sdkImport}
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { renderResult, toolError } from "../_render"
import { defaultAnnotationsForMethod, getAnnotations } from "../_curate"
${shapeBlock}
export function register${capitalize(operationId)}(
  server: McpServer,
  client: AfframeClient,
): void {
  server.registerTool(
    "${camelToSnake(operationId)}",
    {
      title: ${JSON.stringify(op.summary ?? operationId)},
      description: \`${escape(description)}\`,${inputSchemaLine}
      annotations: {
        ...defaultAnnotationsForMethod("${method}"),
        ...getAnnotations("${operationId}"),
      },
    },
    async (${handlerParams}): Promise<CallToolResult> => {
      try {${handlerPrelude}
        const { data, error, response } = await ${clientCallFor(method, path, Boolean(body))}
        if (error) throw error
        if (!response.ok) {
          throw new Error(\`Upstream HTTP \${response.status}\`)
        }
        return renderResult(data)
      } catch (err) {
        return toolError(err)
      }
    },
  )
}
`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function main(): void {
  const spec: Spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as Spec
  mkdirSync(OUT_DIR, { recursive: true })
  const registered: { operationId: string; toolName: string }[] = []

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method]
      if (!op?.operationId) continue
      // GET tools call openapi-fetch with no second argument; POST tools
      // emit a Zod `inputSchema` from the operation's JSON request body
      // and pass `{ body }`. PUT/PATCH/DELETE stay skipped until the first
      // such operation exists — they need path-parameter wiring on top of
      // the body support (mirror this skip in
      // scripts/governance/check-mcp-coverage.mjs when extending).
      if (method !== "get" && method !== "post") continue
      const out = emitTool(op.operationId, method, path, op, spec)
      writeFileSync(resolve(OUT_DIR, `${op.operationId}.ts`), out)
      registered.push({
        operationId: op.operationId,
        toolName: camelToSnake(op.operationId),
      })
    }
  }

  const indexLines = [
    "// AUTO-GENERATED by apps/mcp/scripts/gen-tools.ts — do not edit.",
    'import type { AfframeClient } from "@afframe/sdk"',
    'import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"',
    ...registered.map(
      (r) =>
        `import { register${capitalize(r.operationId)} } from "./${r.operationId}"`,
    ),
    "",
    "export function registerGeneratedTools(server: McpServer, client: AfframeClient): void {",
    ...registered.map(
      (r) => `  register${capitalize(r.operationId)}(server, client)`,
    ),
    "}",
    "",
    "export const GENERATED_TOOL_OPERATION_IDS = [",
    ...registered.map((r) => `  ${JSON.stringify(r.operationId)},`),
    "] as const",
    "",
  ]
  writeFileSync(INDEX_PATH, indexLines.join("\n"))

  process.stdout.write(
    `Generated ${registered.length} MCP tool(s) into apps/mcp/src/tools/generated/\n`,
  )
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
