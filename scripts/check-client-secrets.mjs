#!/usr/bin/env node
/**
 * Client bundle secret-leak guard.
 *
 * Scans every JS file emitted to each public Next.js app's .next/static/** for:
 *   1. Server-only env var references (process.env.X form, rare in optimized output)
 *   2. Inlined secret-shaped values (api keys, db URLs, JWTs, age keys)
 *
 * Also fails if production source maps shipped (.next/static/**\/*.map).
 *
 * Covers both deployed client surfaces — web (app.afframe.com) and admin
 * (admin.afframe.com) — since each ships its own client bundle to a public
 * host. Run after `pnpm turbo build`. Skip gracefully for any app with no
 * .next directory yet (pre-backend stub state).
 */

import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
// Each public-facing Next.js client surface is a separately deployed host, so
// every app's bundle must be clean. Add new client apps here.
const STATIC_DIRS = [
  { app: "web", dir: resolve(REPO_ROOT, "apps/web/.next/static") },
  { app: "admin", dir: resolve(REPO_ROOT, "apps/admin/.next/static") },
]
// HTML/RSC prerender output is intentionally not scanned: showcase pages legitimately
// embed example env strings as visible documentation. Add per-page allowlist if RSC
// payload secret leaks become a real concern.

// Server-only env var names that must never appear in client chunks.
const FORBIDDEN_ENV = [
  /process\.env\.[A-Z0-9_]*_SECRET\b/g,
  /process\.env\.[A-Z0-9_]*_API_KEY\b/g,
  /process\.env\.DB_URL\b/g,
  /process\.env\.DATABASE_URL\b/g,
  /process\.env\.DATABASE_DIRECT_URL\b/g,
  /process\.env\.ANTHROPIC_API_KEY\b/g,
  /process\.env\.BETTER_AUTH_SECRET\b/g,
  /process\.env\.SOPS_AGE_KEY\b/g,
  /process\.env\.AWS_SECRET_ACCESS_KEY\b/g,
  /process\.env\.SMTP_PASS\b/g,
]

// Secret-shaped value patterns (bundler-inlined literals).
// Tight regexes to avoid matching documentation examples in showcase pages.
const FORBIDDEN_VALUES = [
  { name: "anthropic-api-key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai-api-key", re: /sk-[A-Za-z0-9]{32,}/g },
  { name: "aws-access-key-id", re: /AKIA[0-9A-Z]{16}/g },
  // Real postgres URLs ship credentials. Doc strings like
  // "postgres://localhost/dev" do not, so this skips them.
  {
    name: "postgres-url",
    re: /postgres(ql)?:\/\/[^\s:"'`]+:[^\s@"'`]+@[^\s/"'`]+/g,
  },
  { name: "age-secret-key", re: /AGE-SECRET-KEY-1[A-Z0-9]{20,}/g },
  {
    name: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
]

function walk(dir, ext) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full, ext))
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      out.push(full)
    }
  }
  return out
}

function scanFile(filePath) {
  const contents = readFileSync(filePath, "utf8")
  const hits = []
  for (const pattern of FORBIDDEN_ENV) {
    const matches = contents.match(pattern)
    if (matches) {
      hits.push({
        kind: "env",
        pattern: pattern.source,
        matches: [...new Set(matches)],
      })
    }
  }
  for (const { name, re } of FORBIDDEN_VALUES) {
    const matches = contents.match(re)
    if (matches) {
      hits.push({
        kind: "value",
        pattern: name,
        matches: [...new Set(matches)],
      })
    }
  }
  return hits
}

function main() {
  const present = STATIC_DIRS.filter(({ dir }) => existsSync(dir))
  if (present.length === 0) {
    console.log(
      `[check-client-secrets] SKIP: no .next/static found for ${STATIC_DIRS.map((s) => s.app).join(", ")}. ` +
        `Run \`pnpm turbo build\` to enable scanning.`,
    )
    process.exit(0)
  }

  let leaks = 0
  let shippedMaps = 0
  let scanned = 0

  for (const { app, dir } of present) {
    const jsFiles = walk(dir, ".js")
    const mapFiles = walk(dir, ".map")
    scanned += jsFiles.length

    for (const file of jsFiles) {
      const hits = scanFile(file)
      if (hits.length > 0) {
        leaks += 1
        console.error(`[check-client-secrets] LEAK in ${file}`)
        for (const hit of hits) {
          console.error(`  [${hit.kind}] ${hit.pattern}`)
          for (const match of hit.matches) {
            const preview =
              match.length > 40 ? `${match.slice(0, 40)}...` : match
            console.error(`    match: ${preview}`)
          }
        }
      }
    }

    if (mapFiles.length > 0) {
      shippedMaps += mapFiles.length
      console.error(
        `[check-client-secrets] FAIL: ${mapFiles.length} source map(s) shipped in ${app} client. ` +
          `Set productionBrowserSourceMaps: false in next.config.`,
      )
      for (const f of mapFiles.slice(0, 5)) console.error(`  ${f}`)
    }
  }

  if (leaks > 0) {
    console.error(
      `[check-client-secrets] FAIL: ${leaks} file(s) leak server-only env or secret-shaped values.`,
    )
  }

  if (leaks > 0 || shippedMaps > 0) {
    process.exit(1)
  }

  console.log(
    `[check-client-secrets] OK: scanned ${scanned} chunk(s) across ${present.length} app(s) (${present
      .map((s) => s.app)
      .join(", ")}), no leaks.`,
  )
}

main()
