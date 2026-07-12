#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import process from "node:process"

const root = process.cwd()
const docsRoot = join(root, "docs")
const errors = []

const allowedDocsDirectories = new Set([
  "adr",
  "api",
  "compliance",
  "conventions",
  "plans",
  "reference",
  "runbooks",
  "specs",
])

const indexedDirectories = [
  "adr",
  "api",
  "compliance",
  "conventions",
  "plans",
  "reference",
  "runbooks",
  "specs",
]

function repoPath(path) {
  return relative(root, path).replaceAll("\\", "/")
}

function markdownTargets(markdown) {
  const targets = []
  const pattern = /!?\[[^\]]*\]\(([^)\n]+)\)/g
  for (const match of markdown.matchAll(pattern)) {
    let target = match[1].trim()
    if (target.startsWith("<")) {
      target = target.slice(1, target.indexOf(">"))
    } else {
      target = target.split(/\s+/)[0]
    }
    targets.push(target)
  }
  return targets
}

function localTarget(source, target) {
  if (
    !target ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return null
  }

  const path = target.split("#", 1)[0].split("?", 1)[0]
  if (!path) return null

  try {
    return resolve(dirname(source), decodeURIComponent(path))
  } catch {
    return resolve(dirname(source), path)
  }
}

function countHeadings(markdown) {
  let fenced = false
  let count = 0
  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (!fenced && /^#\s+\S/.test(line)) count += 1
  }
  return count
}

for (const entry of readdirSync(docsRoot, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    if (!allowedDocsDirectories.has(entry.name)) {
      errors.push(`docs/${entry.name}: unknown documentation category`)
    }
  } else if (entry.name !== "README.md") {
    errors.push(`docs/${entry.name}: topic files must live in a category`)
  }
}

const markdownFiles = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "*.md",
  ],
  { encoding: "buffer" },
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .map((path) => join(root, path))
  .filter(existsSync)

for (const file of markdownFiles) {
  const markdown = readFileSync(file, "utf8")
  if (file.startsWith(`${docsRoot}/`) && countHeadings(markdown) !== 1) {
    errors.push(`${repoPath(file)}: expected exactly one H1 heading`)
  }

  for (const target of markdownTargets(markdown)) {
    const resolved = localTarget(file, target)
    if (resolved && !existsSync(resolved)) {
      errors.push(`${repoPath(file)}: broken local link ${target}`)
    }
  }
}

for (const directory of indexedDirectories) {
  const path = join(docsRoot, directory)
  const indexPath = join(path, "README.md")
  if (!existsSync(indexPath)) {
    errors.push(`docs/${directory}/README.md: missing category index`)
    continue
  }

  const linked = new Set(
    markdownTargets(readFileSync(indexPath, "utf8"))
      .map((target) => localTarget(indexPath, target))
      .filter(Boolean)
      .map(repoPath),
  )

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "README.md") continue
    const child = join(path, entry.name)
    if (!entry.isDirectory() && !entry.isFile()) continue
    if (!linked.has(repoPath(child))) {
      errors.push(
        `${repoPath(child)}: missing from docs/${directory}/README.md`,
      )
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `Documentation check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`,
  )
  process.exit(1)
}

function countDocuments(directory, categoryRoot = directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce(
    (total, entry) => {
      const child = join(directory, entry.name)
      if (entry.isDirectory())
        return total + countDocuments(child, categoryRoot)
      if (!entry.isFile()) return total
      if (child === join(categoryRoot, "README.md")) return total
      return total + 1
    },
    0,
  )
}

const classifiedDocuments = readdirSync(docsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .reduce(
    (total, entry) => total + countDocuments(join(docsRoot, entry.name)),
    0,
  )

process.stdout.write(
  `Documentation check passed: ${markdownFiles.length} Markdown files, ${classifiedDocuments} classified documents.\n`,
)
