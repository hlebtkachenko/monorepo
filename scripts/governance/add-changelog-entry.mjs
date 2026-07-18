#!/usr/bin/env node
/* global process */
/**
 * Create one CHANGELOG fragment under `changelog.d/`.
 *
 * Each PR writes its own fragment file, so parallel PRs never touch a shared
 * region and never conflict. The file is named `<figure>-<hex>.md` — a random
 * economist/mathematician from `changelog-names.txt` (flavour, on-brand for a
 * finance product) plus a hex suffix that guarantees uniqueness even when the
 * same name recurs. The name carries no meaning; the suffix does the work.
 *
 * Usage:
 *   node scripts/governance/add-changelog-entry.mjs \
 *     --category Fixed \
 *     --entry "Org switcher preserves the current module when switching orgs" \
 *     [--bump patch|minor|major] [--override] [--name custom-slug] [--dir changelog.d]
 *
 * --override marks the --bump as deliberate: the release agent takes it as the
 * final level and does not argue it against a rule-derived default.
 */

import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  BUMP_ORDER,
  CATEGORY_ORDER,
  FRAGMENT_DIR,
  NAMES_FILE,
} from "./changelog-fragments.mjs"

function usage() {
  process.stderr.write(
    [
      "usage: add-changelog-entry.mjs --category <name> --entry <text>",
      "         [--bump patch|minor|major] [--override] [--name <slug>] [--dir <path>]",
      `  categories: ${CATEGORY_ORDER.join(", ")}`,
      "",
    ].join("\n"),
  )
}

function parseArgs(argv) {
  const parsed = {
    category: "",
    entry: "",
    bump: "",
    name: "",
    dir: FRAGMENT_DIR,
    override: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    else if (arg === "--category") parsed.category = argv[++i] ?? ""
    else if (arg === "--entry") parsed.entry = argv[++i] ?? ""
    else if (arg === "--bump") parsed.bump = argv[++i] ?? ""
    else if (arg === "--name") parsed.name = argv[++i] ?? ""
    else if (arg === "--dir") parsed.dir = argv[++i] ?? ""
    else if (arg === "--override") parsed.override = true
    else {
      usage()
      process.stderr.write(`unknown argument: ${arg}\n`)
      process.exit(2)
    }
  }

  if (!parsed.category || !parsed.entry) {
    usage()
    process.exit(2)
  }

  if (!CATEGORY_ORDER.includes(parsed.category)) {
    process.stderr.write(
      `Unknown category "${parsed.category}". Expected one of: ${CATEGORY_ORDER.join(", ")}\n`,
    )
    process.exit(2)
  }

  if (parsed.bump && !BUMP_ORDER.includes(parsed.bump)) {
    process.stderr.write(
      `Invalid bump "${parsed.bump}". Expected one of: ${BUMP_ORDER.join(", ")}\n`,
    )
    process.exit(2)
  }

  return parsed
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

// Unbiased index in [0, count) from the CSPRNG via rejection sampling. Plain
// `randomBytes(2) % count` biases low values whenever 65536 is not a multiple of
// count (js/biased-cryptographic-random); discarding the final partial bucket
// removes the bias.
function randomIndex(count) {
  const limit = Math.floor(0x10000 / count) * count
  let value = randomBytes(2).readUInt16BE(0)
  while (value >= limit) value = randomBytes(2).readUInt16BE(0)
  return value % count
}

function pickName() {
  try {
    const names = readFileSync(NAMES_FILE, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    if (names.length > 0) {
      return names[randomIndex(names.length)]
    }
  } catch {
    // Fall through to the generic slug if the list is unreadable.
  }
  return "entry"
}

function uniqueFragmentPath(dir, base) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = randomBytes(2).toString("hex")
    const path = join(dir, `${base}-${suffix}.md`)
    if (!existsSync(path)) return path
  }
  throw new Error("could not allocate a unique fragment filename")
}

function buildFragment(options) {
  const lines = ["---", `category: ${options.category}`]
  if (options.bump && options.bump !== "patch")
    lines.push(`bump: ${options.bump}`)
  if (options.override) lines.push("override: true")
  lines.push("---", "", options.entry.trim(), "")
  return lines.join("\n")
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  mkdirSync(options.dir, { recursive: true })

  const base = options.name ? slugify(options.name) : slugify(pickName())
  const path = uniqueFragmentPath(options.dir, base || "entry")

  writeFileSync(path, buildFragment(options))
  process.stdout.write(
    `Created changelog fragment ${path} (category: ${options.category}).\n`,
  )
}

main()
