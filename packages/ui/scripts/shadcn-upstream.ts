import { createHash } from "node:crypto"
import { appendFile, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { registry as localRegistry } from "../src/lib/registry"

const UI_ROOT = resolve(import.meta.dirname, "..")
const MANIFEST_PATH = resolve(UI_ROOT, "shadcn-upstream.json")
const CONFIG_PATH = resolve(UI_ROOT, "components.json")
const INDEX_URL = "https://ui.shadcn.com/r/index.json"
const STYLE_REGISTRY_URL = "https://ui.shadcn.com/r/styles/radix-nova"
const SUPPORTED_STYLE = "radix-nova"
const REQUEST_TIMEOUT_MS = 15_000
const REQUEST_ATTEMPTS = 3

export type UpstreamState = "adapted" | "composed" | "covered"
export type AssetFormat = "registry-item" | "text"

export interface ManifestEntry {
  state: UpstreamState
  local?: string
  reason?: string
  digest: string
  reviewedAt: string
}

export interface UpstreamManifest {
  version: 1
  registry: "@shadcn"
  style: string
  items: Record<string, ManifestEntry>
  assets: Record<string, AssetEntry>
}

export interface AssetEntry {
  format: AssetFormat
  url: string
  local: string
  item?: string
  digest: string
  reviewedAt: string
}

const TRACKED_ASSET_SOURCES = {
  "hirael-audit-log": {
    format: "registry-item",
    url: "https://hirael.com/r/audit-log.json",
    local: "src/components/audit-log/audit-log.tsx",
    item: "audit-log",
  },
  "hirael-stat-card": {
    format: "registry-item",
    url: "https://hirael.com/r/stat-card.json",
    local: "src/components/stat-card/stat-card.tsx",
    item: "stat-card",
  },
  typeset: {
    format: "text",
    url: "https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/app/(app)/(typeset)/typeset.css",
    local: "src/styles/typeset.css",
  },
} as const satisfies Record<
  string,
  Pick<AssetEntry, "format" | "url" | "local" | "item">
>

function trackedAssetSource(name: string) {
  if (!Object.hasOwn(TRACKED_ASSET_SOURCES, name)) return undefined
  return TRACKED_ASSET_SOURCES[name as keyof typeof TRACKED_ASSET_SOURCES]
}

export interface RegistryItem {
  name: string
  type: string
  dependencies?: string[]
  devDependencies?: string[]
  registryDependencies?: Array<string | Record<string, unknown>>
  files?: Array<Record<string, unknown>>
  css?: unknown
  cssVars?: unknown
  tailwind?: unknown
  envVars?: unknown
  [key: string]: unknown
}

export interface DriftReport {
  new: string[]
  changedLocal: string[]
  changedCovered: string[]
  removed: string[]
  changedAssets: string[]
  invalidLocal: string[]
  digests: Record<string, string>
  assetDigests: Record<string, string>
}

const METADATA_KEYS = new Set([
  "$schema",
  "author",
  "categories",
  "description",
  "docs",
  "meta",
  "title",
])

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (typeof value === "string") return value.replaceAll("\r\n", "\n")
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalizeValue(child)]),
  )
}

function sortValue(value: unknown): unknown {
  return normalizeValue(value)
}

function sortedSet(values: unknown): unknown[] {
  if (!Array.isArray(values)) return []
  return values
    .map(sortValue)
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    )
}

export function normalizeRegistryItem(item: RegistryItem) {
  const implementation = Object.fromEntries(
    Object.entries(item).filter(([key]) => !METADATA_KEYS.has(key)),
  )
  for (const key of [
    "dependencies",
    "devDependencies",
    "registryDependencies",
  ]) {
    implementation[key] = sortedSet(implementation[key])
  }
  implementation.files = Array.isArray(implementation.files)
    ? implementation.files
        .map(sortValue)
        .sort((left, right) =>
          String((left as { path?: unknown }).path).localeCompare(
            String((right as { path?: unknown }).path),
          ),
        )
    : []
  return sortValue(implementation)
}

export function digestRegistryItem(item: RegistryItem) {
  const normalized = JSON.stringify(normalizeRegistryItem(item))
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`
}

export function digestTextAsset(content: string) {
  return `sha256:${createHash("sha256").update(content.replaceAll("\r\n", "\n")).digest("hex")}`
}

export function validateConfigStyle(style: unknown) {
  if (style !== SUPPORTED_STYLE) {
    throw new Error(`components.json style must remain ${SUPPORTED_STYLE}`)
  }
  return SUPPORTED_STYLE
}

export function validateManifest(manifest: UpstreamManifest, style: string) {
  if (manifest.version !== 1 || manifest.registry !== "@shadcn") {
    throw new Error("Invalid shadcn upstream manifest header")
  }
  if (manifest.style !== style) {
    throw new Error(
      `Manifest style ${manifest.style} does not match components.json style ${style}`,
    )
  }
  for (const [name, entry] of Object.entries(manifest.items)) {
    if (
      !(["adapted", "composed", "covered"] as string[]).includes(entry.state)
    ) {
      throw new Error(`${name}: invalid state ${String(entry.state)}`)
    }
    if (
      (entry.state === "adapted" || entry.state === "composed") &&
      !entry.local
    ) {
      throw new Error(`${name}: ${entry.state} entries require local`)
    }
    if (
      (entry.state === "composed" || entry.state === "covered") &&
      !entry.reason?.trim()
    ) {
      throw new Error(`${name}: ${entry.state} entries require reason`)
    }
    if (!entry.digest.startsWith("sha256:") || !entry.reviewedAt) {
      throw new Error(`${name}: digest and reviewedAt are required`)
    }
  }
  if (!manifest.assets || typeof manifest.assets !== "object") {
    throw new Error("Manifest assets are required")
  }
  const assetNames = Object.keys(manifest.assets).sort()
  const trackedAssetNames = Object.keys(TRACKED_ASSET_SOURCES).sort()
  if (JSON.stringify(assetNames) !== JSON.stringify(trackedAssetNames)) {
    throw new Error(
      `Manifest assets must exactly match tracked sources: ${trackedAssetNames.join(", ")}`,
    )
  }
  for (const [name, source] of Object.entries(TRACKED_ASSET_SOURCES)) {
    const asset = manifest.assets[name]!
    if (
      asset.format !== source.format ||
      asset.url !== source.url ||
      asset.local !== source.local ||
      asset.item !== ("item" in source ? source.item : undefined)
    ) {
      throw new Error(`${name}: source does not match trusted metadata`)
    }
    if (!asset.digest.startsWith("sha256:") || !asset.reviewedAt) {
      throw new Error(`${name}: asset digest and reviewedAt are required`)
    }
  }
}

export function compareUpstream(
  upstream: RegistryItem[],
  manifest: UpstreamManifest,
  localNames: Set<string>,
  localShadcnNames: Set<string>,
  assetDigests: Record<string, string> = {},
): DriftReport {
  const digests = Object.fromEntries(
    upstream.map((item) => [item.name, digestRegistryItem(item)]),
  )
  const upstreamNames = new Set(upstream.map((item) => item.name))
  const next: DriftReport = {
    new: [],
    changedLocal: [],
    changedCovered: [],
    removed: [],
    changedAssets: [],
    invalidLocal: [],
    digests,
    assetDigests,
  }

  for (const item of upstream) {
    const entry = manifest.items[item.name]
    if (!entry) {
      next.new.push(item.name)
    } else if (entry.digest !== digests[item.name]) {
      if (entry.state === "covered") next.changedCovered.push(item.name)
      else next.changedLocal.push(item.name)
    }
  }

  for (const [name, entry] of Object.entries(manifest.items)) {
    if (!upstreamNames.has(name)) next.removed.push(name)
    if (entry.local && !localNames.has(entry.local)) {
      next.invalidLocal.push(
        `${name}: local registry entry ${entry.local} is missing`,
      )
    }
  }
  for (const name of localShadcnNames) {
    if (!manifest.items[name]) {
      next.invalidLocal.push(
        `${name}: local shadcn component lacks manifest entry`,
      )
    }
  }
  for (const [name, entry] of Object.entries(manifest.assets)) {
    if (assetDigests[name] && assetDigests[name] !== entry.digest) {
      next.changedAssets.push(name)
    }
  }

  for (const values of [
    next.new,
    next.changedLocal,
    next.changedCovered,
    next.removed,
    next.changedAssets,
    next.invalidLocal,
  ])
    values.sort()

  return next
}

export async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: "application/json",
          "User-Agent": "afframe-shadcn-audit",
        },
      })
      if (!response.ok) {
        if (response.status >= 500)
          throw new Error(`${response.status} ${response.statusText}`)
        throw new Error(`${url}: ${response.status} ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt === REQUEST_ATTEMPTS) break
    }
  }
  throw new Error(
    `${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

export async function fetchText(url: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": "afframe-shadcn-audit" },
      })
      if (!response.ok) {
        if (response.status >= 500)
          throw new Error(`${response.status} ${response.statusText}`)
        throw new Error(`${url}: ${response.status} ${response.statusText}`)
      }
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt === REQUEST_ATTEMPTS) break
    }
  }
  throw new Error(
    `${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

function assertRegistryItem(
  value: unknown,
  expectedName?: string,
): RegistryItem {
  if (!value || typeof value !== "object")
    throw new Error("Registry item must be an object")
  const item = value as RegistryItem
  if (
    !item.name ||
    !item.type ||
    (expectedName && item.name !== expectedName)
  ) {
    throw new Error(
      `Invalid registry item${expectedName ? ` for ${expectedName}` : ""}`,
    )
  }
  return item
}

async function fetchUpstream() {
  const rawIndex = await fetchJson(INDEX_URL)
  if (!Array.isArray(rawIndex))
    throw new Error("Official registry index must be an array")
  const names = rawIndex
    .map((item) => assertRegistryItem(item))
    .filter((item) => item.type === "registry:ui")
    .map((item) => item.name)
  if (new Set(names).size !== names.length)
    throw new Error("Official registry contains duplicate UI names")

  const items: RegistryItem[] = []
  for (let index = 0; index < names.length; index += 8) {
    const batch = names.slice(index, index + 8)
    items.push(
      ...(await Promise.all(
        batch.map(async (name) => {
          const value = await fetchJson(`${STYLE_REGISTRY_URL}/${name}.json`)
          return assertRegistryItem(value, name)
        }),
      )),
    )
  }
  return items
}

async function fetchUpstreamAssets() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(TRACKED_ASSET_SOURCES).map(async ([name, source]) => {
        if (source.format === "text") {
          return [name, digestTextAsset(await fetchText(source.url))]
        }
        const item = assertRegistryItem(
          await fetchJson(source.url),
          source.item,
        )
        return [name, digestRegistryItem(item)]
      }),
    ),
  )
}

async function validateLocalAssets() {
  const errors: string[] = []
  for (const [name, source] of Object.entries(TRACKED_ASSET_SOURCES)) {
    try {
      await readFile(resolve(UI_ROOT, source.local))
    } catch {
      errors.push(`${name}: local source asset ${source.local} is missing`)
    }
  }
  return errors
}

function hasDrift(report: DriftReport) {
  return Boolean(
    report.new.length ||
    report.changedLocal.length ||
    report.changedCovered.length ||
    report.removed.length ||
    report.changedAssets.length ||
    report.invalidLocal.length,
  )
}

function markdownReport(report: DriftReport, manifest: UpstreamManifest) {
  const sections: Array<[string, string[]]> = [
    ["New upstream items", report.new],
    ["Changed adapted or composed items", report.changedLocal],
    ["Changed covered items", report.changedCovered],
    ["Removed upstream items", report.removed],
    ["Invalid local coverage", report.invalidLocal],
  ]
  const lines = [
    "# shadcn upstream review required",
    "",
    "Upstream changed since the last explicit review. This does not mean local adapted components are wrong.",
    "Never run `add --overwrite`. Preserve Afframe tokens, exports, icon abstraction, tests, stories, registry metadata, and nested component structure.",
    "",
  ]
  for (const [heading, items] of sections) {
    if (!items.length) continue
    lines.push(`## ${heading}`, "")
    for (const item of items) {
      const name = item.split(":", 1)[0]!
      const entry = manifest.items[name]
      const asset = trackedAssetSource(name)
      const detail = report.digests[name]
        ? ` current \`${report.digests[name]}\`${entry ? `, reviewed \`${entry.digest}\`` : ""}`
        : ""
      if (asset) {
        lines.push(
          `- **${item}**`,
          `  - Source: ${asset.url}`,
          `  - Local: \`${asset.local}\``,
          `  - Record review: \`pnpm review:shadcn-upstream -- --asset ${name}\``,
        )
      } else {
        lines.push(
          `- **${item}**${detail}`,
          `  - Source: ${STYLE_REGISTRY_URL}/${name}.json`,
          ...(entry?.local
            ? [`  - Local registry item: \`${entry.local}\``]
            : []),
          `  - Inspect: \`pnpm shadcn view @shadcn/${name} -c packages/ui\``,
          `  - Record review: \`pnpm review:shadcn-upstream -- --item ${name}\``,
        )
      }
    }
    lines.push("")
  }
  if (report.changedAssets.length) {
    lines.push("## Changed source assets", "")
    for (const name of report.changedAssets) {
      const source = trackedAssetSource(name)!
      const reviewed = manifest.assets[name]!
      lines.push(
        `- **${name}** current \`${report.assetDigests[name]}\`, reviewed \`${reviewed.digest}\``,
        `  - Source: ${source.url}`,
        `  - Local: \`${source.local}\``,
        `  - Record review: \`pnpm review:shadcn-upstream -- --asset ${name}\``,
      )
    }
    lines.push("")
  }
  return lines.join("\n")
}

async function readConfigStyle() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as {
    style?: unknown
  }
  return validateConfigStyle(config.style)
}

async function readManifest(style: string): Promise<UpstreamManifest> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as UpstreamManifest
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return { version: 1, registry: "@shadcn", style, items: {}, assets: {} }
  }
}

function localCoverage() {
  const localNames = new Set(Object.keys(localRegistry))
  const localShadcnNames = new Set(
    Object.entries(localRegistry)
      .filter(
        ([, meta]) =>
          meta.source.includes("shadcn") &&
          meta.upstream?.includes("/docs/components/"),
      )
      .map(([name]) => name),
  )
  return { localNames, localShadcnNames }
}

function argValues(flag: string) {
  const values: string[] = []
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] === flag && process.argv[index + 1])
      values.push(process.argv[index + 1]!)
  }
  return values
}

async function main() {
  const command = process.argv[2] ?? "check"
  const style = await readConfigStyle()
  const manifest = await readManifest(style)
  if (Object.keys(manifest.items).length) validateManifest(manifest, style)
  const upstream = await fetchUpstream()
  const assetDigests = await fetchUpstreamAssets()

  if (command === "review") {
    const names = argValues("--item")
    const assetNames = argValues("--asset")
    if (!names.length && !assetNames.length)
      throw new Error("review requires one or more --item or --asset values")
    const stateArg = argValues("--state").at(-1) as UpstreamState | undefined
    const localArg = argValues("--local").at(-1)
    const reasonArg = argValues("--reason").at(-1)
    const upstreamByName = new Map(upstream.map((item) => [item.name, item]))
    const reviewedAt = new Date().toISOString().slice(0, 10)
    for (const name of names) {
      const item = upstreamByName.get(name)
      if (!item) throw new Error(`${name}: not found in official registry`)
      const previous = manifest.items[name]
      const state = stateArg ?? previous?.state
      if (!state) throw new Error(`${name}: new entries require --state`)
      const local =
        localArg ?? previous?.local ?? (state === "covered" ? undefined : name)
      const reason = reasonArg ?? previous?.reason
      manifest.items[name] = {
        state,
        ...(local ? { local } : {}),
        ...(reason ? { reason } : {}),
        digest: digestRegistryItem(item),
        reviewedAt,
      }
    }
    for (const name of assetNames) {
      const source = trackedAssetSource(name)
      const digest = assetDigests[name]
      if (!source || !digest) throw new Error(`${name}: unknown source asset`)
      manifest.assets[name] = { ...source, digest, reviewedAt }
    }
    manifest.items = Object.fromEntries(
      Object.entries(manifest.items).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    )
    validateManifest(manifest, style)
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`Reviewed ${[...names, ...assetNames].join(", ")}`)
    return
  }

  if (command !== "check") throw new Error(`Unknown command ${command}`)
  validateManifest(manifest, style)
  const report = compareUpstream(
    upstream,
    manifest,
    localCoverage().localNames,
    localCoverage().localShadcnNames,
    assetDigests,
  )
  report.invalidLocal.push(...(await validateLocalAssets()))
  report.invalidLocal.sort()
  const body = hasDrift(report)
    ? markdownReport(report, manifest)
    : "shadcn upstream: reviewed baseline is current"
  console.log(body)
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `has_updates=${hasDrift(report)}\n`,
    )
  }
  if (process.env.SHADCN_REPORT_PATH) {
    await writeFile(process.env.SHADCN_REPORT_PATH, `${body}\n`)
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
