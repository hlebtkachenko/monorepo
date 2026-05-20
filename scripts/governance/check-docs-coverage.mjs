#!/usr/bin/env node
/**
 * Docs coverage check — every resource declared in `packages/shared/src/api/`
 * must have a matching MDX page under `apps/docs/content/developers/`.
 *
 * Exit 0: every resource has a page; or the `apps/docs/` scaffold is absent
 *         (we skip the gate until Phase C lands).
 * Exit 1: at least one resource is missing — prints the gap list.
 *
 * Invoked from `.github/workflows/docs-coverage.yml`.
 */

import { existsSync, readdirSync } from "node:fs"
import { parse } from "node:path"

const API_DIR = "packages/shared/src/api"
const DOCS_DIR = "apps/docs/content/developers"
const IGNORE = new Set([
  "common.ts",
  "primitives.ts",
  "registry.ts",
  "zod-openapi.ts",
  "index.ts",
])

if (!existsSync(DOCS_DIR)) {
  process.stdout.write(`${DOCS_DIR} not scaffolded yet — skipping.\n`)
  process.exit(0)
}

const resources = readdirSync(API_DIR)
  .filter((f) => f.endsWith(".ts") && !IGNORE.has(f))
  .map((f) => f.replace(/\.ts$/, ""))

const docs = new Set(readdirSync(DOCS_DIR).map((f) => parse(f).name))

const missing = resources.filter((r) => !docs.has(r))
if (missing.length) {
  process.stdout.write(missing.join("\n") + "\n")
  process.exit(1)
}
