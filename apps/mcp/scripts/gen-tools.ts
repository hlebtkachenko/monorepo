import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  defaultAnnotationsForMethod,
  getAnnotations,
} from "../src/tools/_curate"

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
  format?: string
  anyOf?: JsonSchemaNode[]
  oneOf?: JsonSchemaNode[]
}

interface Parameter {
  $ref?: string
  name?: string
  in?: "path" | "query" | "header" | "cookie"
  required?: boolean
  description?: string
  schema?: JsonSchemaNode
}

interface Operation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: Parameter[]
  requestBody?: {
    content?: Record<string, { schema?: JsonSchemaNode }>
  }
}

interface Spec {
  paths?: Record<string, Record<string, Operation>>
  tags?: { name: string; description?: string }[]
  components?: {
    schemas?: Record<string, JsonSchemaNode>
    parameters?: Record<string, Parameter>
  }
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
  // `anyOf` / `oneOf` (a Zod `z.union(...)`, e.g. the posting `entry`'s
  // double|monetary shapes) → `z.union([...])`. Without this the node falls
  // through to the terminal `z.unknown()`, leaving the LLM with no shape to
  // build (the write it then guesses fails server validation). A `{type:"null"}`
  // branch (nullable union) is lifted to a trailing `.nullable()`; a single
  // remaining branch needs no `z.union` wrapper.
  const union = node.anyOf ?? node.oneOf
  const isNullBranch = (b: JsonSchemaNode): boolean =>
    b.type === "null" ||
    (Array.isArray(b.type) && b.type.length === 1 && b.type[0] === "null")
  let expr: string
  if (union && union.length > 0) {
    const branches = union.filter((b) => !isNullBranch(b))
    const unionNullable = branches.length !== union.length
    const exprs = branches.map((b) => zodExprFor(b, spec, seen))
    if (exprs.length === 0) expr = "z.unknown()"
    else if (exprs.length === 1) expr = exprs[0]
    else expr = `z.union([${exprs.join(", ")}])`
    if (unionNullable) expr += ".nullable()"
  } else if (
    enumValues &&
    enumValues.length > 0 &&
    enumValues.every((v) => typeof v === "string")
  ) {
    expr = `z.enum(${JSON.stringify(enumValues)})`
  } else if (base === "string") {
    expr = "z.string()"
    if (typeof node.minLength === "number") expr += `.min(${node.minLength})`
    if (typeof node.maxLength === "number") expr += `.max(${node.maxLength})`
    // `format: "uuid"` (#577) is the only string format currently enforced
    // here — the MCP-side schema stays a usability layer for the LLM, not
    // the enforcement boundary (the api re-validates every body), so other
    // formats (email/uri/date-time) are left to that server-side check.
    if (node.format === "uuid") expr += ".uuid()"
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

/** One operation parameter, resolved and grouped by `in` location. */
interface ParameterInfo {
  /** Parameter name — the spec's exact casing (round-trips openapi-fetch). */
  name: string
  in: "path" | "query" | "header"
  required: boolean
  /** Zod expression for the parameter schema (`.optional()` appended below). */
  zodExpr: string
}

/**
 * Resolve a `#/components/parameters/<Name>` $ref against the spec. Returns
 * the target parameter node, or the input untouched when it's already inline.
 */
function resolveParameterRef(param: Parameter, spec: Spec): Parameter {
  if (!param.$ref) return param
  const name = param.$ref.replace("#/components/parameters/", "")
  return spec.components?.parameters?.[name] ?? param
}

/**
 * Collect an operation's parameters (path / query / header), resolving any
 * `$ref` entries. Cookie params — none in the current surface — are dropped.
 * Path params are always treated as required (openapi-fetch demands them).
 */
function buildParameterInfos(op: Operation, spec: Spec): ParameterInfo[] {
  const infos: ParameterInfo[] = []
  for (const raw of op.parameters ?? []) {
    const param = resolveParameterRef(raw, spec)
    if (!param.name || !param.in) continue
    if (param.in === "cookie") continue
    const schema = param.schema ?? { type: "string" }
    infos.push({
      name: param.name,
      in: param.in,
      required: param.in === "path" ? true : Boolean(param.required),
      zodExpr: zodExprFor(schema, spec),
    })
  }
  return infos
}

/**
 * Emit the openapi-fetch `client.VERB(...)` call.
 *
 * The path is a bare string literal so TS narrows it to its literal type and
 * openapi-fetch's `PathsWithMethod` still accepts the match — no `as never`
 * on the whole call. The `init` object (`{ body?, params? }`) is assembled in
 * the handler from the split `args`; its `params` sub-object is cast to the
 * operation's precise `operations[id]["parameters"]` type (the exact shape
 * `ParamsOption<T>` expects, round-tripping the spec's key casing), and the
 * body keeps the existing `components["schemas"][Ref]` cast. Operations with
 * neither a body nor parameters keep the bare single-argument call so their
 * `params?`-optional type is not broken by an empty init.
 */
function clientCallFor(method: string, path: string, hasInit: boolean): string {
  const verb = method.toUpperCase()
  return hasInit
    ? `client.${verb}("${path}", init)`
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
  const params = buildParameterInfos(op, spec)
  const pathParams = params.filter((p) => p.in === "path")
  const queryParams = params.filter((p) => p.in === "query")
  const headerParams = params.filter((p) => p.in === "header")

  // The MCP SDK validates tool arguments against `inputShape` before the
  // handler runs, so both body fields and parameters live in one raw shape.
  // A tool has an input schema whenever it has a body OR any parameter.
  const hasInput = Boolean(body) || params.length > 0

  // Raw-shape entries: body-derived fields (from buildRequestBodyInfo) plus
  // one field per parameter, keyed by the spec's exact parameter name so it
  // round-trips into openapi-fetch's `params.{path,query,header}`.
  const bodyShapeLines = body
    ? body.shapeSource.split("\n").slice(1, -1) // drop the `const inputShape = {` / `}` wrapper lines
    : []
  const paramShapeLines = params.map((p) => {
    const expr = p.required ? p.zodExpr : `${p.zodExpr}.optional()`
    return `  ${JSON.stringify(p.name)}: ${expr},`
  })
  const shapeSource = hasInput
    ? ["const inputShape = {", ...bodyShapeLines, ...paramShapeLines, "}"].join(
        "\n",
      )
    : ""

  // The cast bridges the zod-inferred argument type to the spec-generated
  // body type for openapi-fetch.
  const bodyType = body
    ? body.refName
      ? `components["schemas"][${JSON.stringify(body.refName)}]`
      : "Record<string, unknown>"
    : null

  const needsComponents = Boolean(body)
  const sdkImport = needsComponents
    ? 'import type { AfframeClient, components } from "@afframe/sdk"'
    : 'import type { AfframeClient } from "@afframe/sdk"'
  const zodImport = hasInput ? 'import { z } from "zod"\n' : ""
  const shapeBlock = hasInput ? `\n${shapeSource}\n` : ""
  const inputSchemaLine = hasInput ? "\n      inputSchema: inputShape," : ""
  const handlerParams = hasInput ? "args" : ""

  // Handler prelude: split the validated args into parameter groups + body,
  // then assemble the openapi-fetch `init`. `params` is cast to the
  // operation's precise `operations[id]["parameters"]` type (exactly what
  // `ParamsOption<T>` expects), and the body keeps its `components` cast.
  const preludeLines: string[] = []
  const paramNames = params.map((p) => p.name)
  if (params.length > 0) {
    preludeLines.push("const raw = args as Record<string, unknown>")
  }
  const groupExprs: string[] = []
  const emitGroup = (group: ParameterInfo[], key: string): void => {
    if (group.length === 0) return
    const entries = group
      .map((p) => `${JSON.stringify(p.name)}: raw[${JSON.stringify(p.name)}]`)
      .join(", ")
    groupExprs.push(`${key}: { ${entries} }`)
  }
  emitGroup(pathParams, "path")
  emitGroup(queryParams, "query")
  emitGroup(headerParams, "header")
  if (groupExprs.length > 0) {
    preludeLines.push(
      `const params = { ${groupExprs.join(", ")} } as unknown as ` +
        `NonNullable<operations[${JSON.stringify(operationId)}]["parameters"]>`,
    )
  }
  if (body) {
    if (params.length > 0) {
      // Body is every arg field that is not a parameter. Runtime omit keeps
      // this valid for hyphenated param names (e.g. `idempotency-key`) that
      // can't be object-destructured to an identifier.
      preludeLines.push(
        `const paramKeys = new Set(${JSON.stringify(paramNames)})`,
      )
      preludeLines.push(
        "const bodyFields = Object.fromEntries(" +
          "Object.entries(raw).filter(([k]) => !paramKeys.has(k)))",
      )
      preludeLines.push(`const body = bodyFields as unknown as ${bodyType}`)
    } else {
      preludeLines.push(`const body = args as unknown as ${bodyType}`)
    }
  }
  const initFields: string[] = []
  if (body) initFields.push("body")
  if (groupExprs.length > 0) initFields.push("params")
  const hasInit = initFields.length > 0
  if (hasInit) {
    preludeLines.push(`const init = { ${initFields.join(", ")} }`)
  }
  const needsOperations = groupExprs.length > 0

  const handlerPrelude =
    preludeLines.length > 0
      ? "\n" + preludeLines.map((l) => `        ${l}`).join("\n")
      : ""

  const operationsImport = needsOperations
    ? sdkImport.replace(
        needsComponents ? "components }" : "AfframeClient }",
        needsComponents
          ? "components, operations }"
          : "AfframeClient, operations }",
      )
    : sdkImport

  return `// AUTO-GENERATED by apps/mcp/scripts/gen-tools.ts — do not edit.
${zodImport}${operationsImport}
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
        const { data, error, response } = await ${clientCallFor(method, path, hasInit)}
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

/** Slugify an OpenAPI tag into a stable group key (e.g. "OCR Templates" → "ocr-templates"). */
function slugifyTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function main(): void {
  const spec: Spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as Spec
  mkdirSync(OUT_DIR, { recursive: true })
  const registered: {
    operationId: string
    toolName: string
    group: string
    readOnly: boolean
    destructive: boolean
  }[] = []

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method]
      if (!op?.operationId) continue
      // GET and POST tools both thread operation parameters (path / query /
      // header) into the openapi-fetch `init` alongside any JSON request body
      // (see emitTool). PUT/PATCH/DELETE stay skipped until the first such
      // operation exists — the param+body wiring already generalizes to them,
      // but the annotation defaults in `_curate` need a pass first (mirror
      // this method skip in scripts/governance/check-mcp-coverage.mjs when
      // extending to more verbs).
      if (method !== "get" && method !== "post") continue
      const out = emitTool(op.operationId, method, path, op, spec)
      writeFileSync(resolve(OUT_DIR, `${op.operationId}.ts`), out)
      // Group + read/destructive metadata are single-sourced: the group is the
      // operation's first OpenAPI tag; the annotations come from the same
      // `_curate` seam the generated tool files use, so they never diverge.
      const ann = {
        ...defaultAnnotationsForMethod(method),
        ...getAnnotations(op.operationId),
      }
      registered.push({
        operationId: op.operationId,
        toolName: camelToSnake(op.operationId),
        group: slugifyTag(op.tags?.[0] ?? "other"),
        readOnly: ann.readOnlyHint === true,
        destructive: ann.destructiveHint === true,
      })
    }
  }

  // Build the group catalog: slug → { description, count }. Description comes
  // from the spec's top-level tag list when present, else the slug itself.
  const tagDescription = new Map(
    (spec.tags ?? []).map((t) => [slugifyTag(t.name), t.description ?? ""]),
  )
  const groupCounts = new Map<string, number>()
  for (const r of registered) {
    groupCounts.set(r.group, (groupCounts.get(r.group) ?? 0) + 1)
  }
  const groupCatalog = [...groupCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slug, count]) => ({
      slug,
      description: tagDescription.get(slug) ?? slug,
      count,
    }))

  const indexLines = [
    "// AUTO-GENERATED by apps/mcp/scripts/gen-tools.ts — do not edit.",
    'import type { AfframeClient } from "@afframe/sdk"',
    'import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"',
    ...registered.map(
      (r) =>
        `import { register${capitalize(r.operationId)} } from "./${r.operationId}"`,
    ),
    "",
    "type Registrar = (server: McpServer, client: AfframeClient) => void",
    "",
    "const REGISTRARS: Record<string, Registrar> = {",
    ...registered.map(
      (r) => `  ${r.operationId}: register${capitalize(r.operationId)},`,
    ),
    "}",
    "",
    "interface ToolMeta {",
    "  /** Slugified first OpenAPI tag — the group an agent can select by. */",
    "  group: string",
    "  readOnly: boolean",
    "  destructive: boolean",
    "}",
    "",
    "/** Per-operation group + read/destructive metadata (spec order). Internal to the gated registrar. */",
    "const TOOL_INDEX: Record<string, ToolMeta> = {",
    ...registered.map(
      (r) =>
        `  ${r.operationId}: { group: ${JSON.stringify(r.group)}, readOnly: ${r.readOnly}, destructive: ${r.destructive} },`,
    ),
    "}",
    "",
    "/** Catalog of selectable tool groups (slug, description, tool count). */",
    "export const TOOL_GROUP_CATALOG = [",
    ...groupCatalog.map(
      (g) =>
        `  { slug: ${JSON.stringify(g.slug)}, description: ${JSON.stringify(g.description)}, count: ${g.count} },`,
    ),
    "] as const",
    "",
    "export interface ToolSelection {",
    "  /** Register only tools in these groups. Undefined = every group. */",
    "  groups?: readonly string[]",
    '  /** "read" = read-only tools; "write" = non-destructive mutating (== all today, no destructive tools); "all" = everything. */',
    '  scope?: "read" | "write" | "all"',
    "}",
    "",
    "/**",
    " * Register generated tools onto an McpServer. With no selection, registers",
    " * every tool (backward-compatible with the stdio entrypoint). A selection",
    " * gates registration by group and/or scope, so the hosted Worker exposes a",
    " * smaller, relevant surface and never builds the unselected tools.",
    " */",
    "export function registerGeneratedTools(",
    "  server: McpServer,",
    "  client: AfframeClient,",
    "  selection: ToolSelection = {},",
    "): void {",
    '  const { groups, scope = "all" } = selection',
    "  for (const [operationId, register] of Object.entries(REGISTRARS)) {",
    "    const meta = TOOL_INDEX[operationId]",
    "    if (!meta) continue",
    "    if (groups && !groups.includes(meta.group)) continue",
    '    if (scope === "read" && !meta.readOnly) continue',
    '    if (scope === "write" && meta.destructive) continue',
    "    register(server, client)",
    "  }",
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
