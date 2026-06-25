#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { resolve, join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ADMIN_ROOT = resolve(__dirname, "..")
const GATED_ROOT = join(ADMIN_ROOT, "app", "(gated)")
const OUT = join(
  ADMIN_ROOT,
  "app",
  "(gated)",
  "_components",
  "route-registry.generated.ts",
)

const SECTION_LABELS = {
  "": "Home",
  agents: "Agents",
  changelog: "Home",
  compliance: "Compliance",
  config: "Configuration",
  dev: "Developer",
  finops: "Finance",
  growth: "Growth",
  me: "Home",
  ops: "Operations",
  orgs: "Organizations",
  product: "Product",
  showcase: "Showcase",
  staff: "Staff",
  typography: "Showcase",
  users: "Users",
}

const SECTION_KEYWORDS = {
  agents: "workflows ai tool calls",
  compliance: "audit gdpr policies sars exports",
  config: "settings flags policies throttles locales",
  dev: "developer api keys openapi mcp webhooks sql sandbox tokens",
  finops: "finance invoices payments vat fx budgets",
  growth: "marketing cohorts funnels campaigns email flags",
  ops: "infrastructure jobs queue dlq outbox openstatus health migrations deploys aws cloudflare incidents",
  orgs: "tenants organizations clients",
  product: "analytics usage retention feedback themes",
  staff: "members roles hardware tokens sso onboarding runbooks security",
  users: "people accounts identity sessions security impersonate timeline",
}

const SEGMENT_LABELS = {
  "api-keys": "API keys",
  "review-queue": "Review queue",
  "feature-flags": "Feature flags",
  "ai-usage": "AI usage",
  "flag-audit": "Flag audit",
  "hardware-tokens": "Hardware tokens",
  "fx-rates": "FX rates",
  vat: "VAT",
  dlq: "DLQ",
  aws: "AWS",
  mcp: "MCP",
  gdpr: "GDPR",
  sars: "SARs",
  sso: "SSO",
  oauth: "OAuth",
  sql: "SQL",
  openapi: "OpenAPI",
  openstatus: "OpenStatus",
}

function titleCase(seg) {
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg]
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function extractMetadataTitle(filePath) {
  try {
    const src = readFileSync(filePath, "utf8")
    const m = src.match(/metadata\s*=\s*\{[^}]*title\s*:\s*["'`]([^"'`]+)["'`]/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (entry.startsWith("_") || entry.startsWith(".")) continue
    const s = statSync(p)
    if (s.isDirectory()) walk(p, acc)
    else if (entry === "page.tsx") acc.push(p)
  }
  return acc
}

function pathToHref(pagePath) {
  const rel = relative(GATED_ROOT, dirname(pagePath))
  if (rel === "" || rel === ".") return "/"
  return "/" + rel.split("/").join("/")
}

function pathToLabelChain(href) {
  const segs = href === "/" ? [] : href.slice(1).split("/")
  return segs.map(titleCase)
}

function labelFor(href, metaTitle) {
  if (metaTitle) return metaTitle
  const chain = pathToLabelChain(href)
  if (chain.length === 0) return "Home"
  return chain.join(" › ")
}

function sectionFor(href) {
  if (href === "/") return "Home"
  const seg = href.slice(1).split("/")[0]
  return SECTION_LABELS[seg] ?? titleCase(seg)
}

function sectionKey(href) {
  if (href === "/") return ""
  return href.slice(1).split("/")[0]
}

function hasDynamicSegment(href) {
  return /\[[^\]]+\]/.test(href)
}

const pages = walk(GATED_ROOT)
  .map((p) => {
    const href = pathToHref(p)
    if (hasDynamicSegment(href)) return null
    const metaTitle = extractMetadataTitle(p)
    const label = labelFor(href, metaTitle)
    const section = sectionFor(href)
    const segKey = sectionKey(href)
    const keywords = [
      pathToLabelChain(href).join(" "),
      SECTION_KEYWORDS[segKey] ?? "",
      href.replace(/[/-]/g, " "),
    ]
      .join(" ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
    return { href, label, section, keywords }
  })
  .filter(Boolean)
  .sort((a, b) => {
    if (a.section !== b.section) return a.section.localeCompare(b.section)
    return a.href.localeCompare(b.href)
  })

const banner = `// THIS FILE IS GENERATED. Do not edit by hand.
// Regenerate with: pnpm --filter admin generate:routes
// Source: scan of apps/admin/app/(gated)/**/page.tsx`

const body = `${banner}

export interface RouteEntry {
  href: string
  label: string
  section: string
  keywords: string
}

export const ROUTE_REGISTRY: RouteEntry[] = ${JSON.stringify(pages, null, 2)}
`

writeFileSync(OUT, body, "utf8")
console.log(`Wrote ${pages.length} routes to ${relative(ADMIN_ROOT, OUT)}`)
