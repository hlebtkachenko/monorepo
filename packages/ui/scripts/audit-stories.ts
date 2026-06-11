/**
 * Story coverage audit script.
 *
 * Scans each component for visual variants (CVA definitions and typed prop
 * unions mapped to data-* attributes) and checks whether matching Storybook
 * stories exist.
 *
 * Usage:
 *   tsx packages/ui/scripts/audit-stories.ts          # report only
 *   tsx packages/ui/scripts/audit-stories.ts --fix     # report + generate missing stories
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, basename } from "node:path"

const COMPONENTS_DIR = join(import.meta.dirname, "../src/components")
const BLOCKS_DIR = join(import.meta.dirname, "../src/blocks")
const FIX_MODE = process.argv.includes("--fix")

interface VariantInfo {
  name: string
  values: string[]
  source: "cva" | "prop-union"
}

interface ComponentAudit {
  name: string
  dir: string
  variants: VariantInfo[]
  hasDisabledProp: boolean
  hasStoriesFile: boolean
  existingStories: string[]
  missingStories: string[]
}

function extractCvaVariants(source: string): VariantInfo[] {
  const variants: VariantInfo[] = []

  const allCvaMatches = [
    ...source.matchAll(
      /(\w+Variants)\s*=\s*cva\s*\(\s*(?:`[^`]*`|"[^"]*"|'[^']*'|[\s\S]*?)\s*,\s*\{([\s\S]*?)\}\s*\)/g,
    ),
  ]

  for (const cvaMatch of allCvaMatches) {
    const configBlock = cvaMatch[2]

    const variantsOuter = configBlock.match(
      /variants\s*:\s*\{([\s\S]*?)\}\s*(?:,\s*defaultVariants|$)/,
    )
    if (!variantsOuter) continue

    const variantsInner = variantsOuter[1]

    let depth = 0
    let currentKey = ""
    let blockStart = -1
    const variantGroups: { name: string; block: string }[] = []
    let i = 0

    while (i < variantsInner.length) {
      if (depth === 0) {
        const keyMatch = variantsInner
          .slice(i)
          .match(/^\s*["']?([\w-]+)["']?\s*:\s*\{/)
        if (keyMatch) {
          currentKey = keyMatch[1]
          i += keyMatch[0].length
          depth = 1
          blockStart = i
          continue
        }
      }

      if (variantsInner[i] === "{") depth++
      if (variantsInner[i] === "}") {
        depth--
        if (depth === 0 && currentKey) {
          variantGroups.push({
            name: currentKey,
            block: variantsInner.slice(blockStart, i),
          })
          currentKey = ""
        }
      }
      i++
    }

    for (const group of variantGroups) {
      const values: string[] = []

      const lineRegex = /^\s*["']?([\w-]+)["']?\s*:\s*(?:\n|"[^"]*"|`[^`]*`)/gm
      let lineMatch: RegExpExecArray | null

      while ((lineMatch = lineRegex.exec(group.block)) !== null) {
        const beforeMatch = group.block.slice(0, lineMatch.index)
        const openQuotes = (beforeMatch.match(/(?<!\\)"/g) || []).length
        if (openQuotes % 2 !== 0) continue

        const key = lineMatch[1]
        if (key && !values.includes(key)) {
          values.push(key)
        }
      }

      if (values.length > 0) {
        variants.push({ name: group.name, values, source: "cva" })
      }
    }
  }

  return variants
}

const IGNORED_PROPS = new Set([
  "className",
  "children",
  "asChild",
  "ref",
  "type",
  "dir",
  "id",
  "role",
  "key",
  "tabIndex",
  "as",
  "slot",
  "style",
  "title",
  "lang",
  "htmlFor",
])

function extractPropUnionVariants(source: string): VariantInfo[] {
  const variants: VariantInfo[] = []

  const interfaceBlocks = [
    ...source.matchAll(
      /(?:interface|type)\s+\w+(?:Props|Config)\b[^{]*\{([\s\S]*?)\n\}/g,
    ),
  ].map((m) => m[1])

  const propsSource = interfaceBlocks.join("\n")
  if (!propsSource) return variants

  const propRegex = /(\w+)\s*\??\s*:\s*((?:"[\w-]+"(?:\s*\|\s*"[\w-]+")+))/g
  let match: RegExpExecArray | null

  while ((match = propRegex.exec(propsSource)) !== null) {
    const propName = match[1]
    const unionStr = match[2]

    if (IGNORED_PROPS.has(propName)) continue

    const values = [...unionStr.matchAll(/"([\w-]+)"/g)].map((m) => m[1])
    if (values.length < 2) continue

    const alreadyCva = variants.some(
      (v) => v.source === "cva" && v.name === propName,
    )
    if (alreadyCva) continue

    const isDuplicate = variants.some(
      (v) =>
        v.name === propName &&
        v.values.length === values.length &&
        v.values.every((val) => values.includes(val)),
    )
    if (isDuplicate) continue

    variants.push({ name: propName, values, source: "prop-union" })
  }

  return variants
}

function extractExistingStories(storiesSource: string): string[] {
  const stories: string[] = []
  const storyRegex = /export\s+const\s+(\w+)\s*[=:]/g
  let match: RegExpExecArray | null

  while ((match = storyRegex.exec(storiesSource)) !== null) {
    if (match[1] !== "default") {
      stories.push(match[1])
    }
  }

  return stories
}

function variantValueToStoryName(variantName: string, value: string): string {
  const name = value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")

  if (variantName === "variant") return name
  if (variantName === "size") return `Size${name}`
  return `${variantName.charAt(0).toUpperCase() + variantName.slice(1)}${name}`
}

const SIZE_ALIASES: Record<string, string[]> = {
  sizesm: ["small"],
  sizelg: ["large"],
  sizexs: ["extrasmall", "xsmall"],
  sizemd: ["medium"],
}

function storyNameExists(existing: string[], target: string): boolean {
  const nt = target.toLowerCase().replace(/[-_]/g, "")
  return existing.some((s) => {
    const ns = s.toLowerCase().replace(/[-_]/g, "")
    if (ns === nt) return true
    if (nt.startsWith("size") && SIZE_ALIASES[nt]?.includes(ns)) return true
    if (ns.endsWith(nt) && ns.length > nt.length) return true
    return false
  })
}

function auditComponent(componentDir: string): ComponentAudit | null {
  const name = basename(componentDir)
  const mainFile = join(componentDir, `${name}.tsx`)
  const storiesFile = join(componentDir, `${name}.stories.tsx`)

  let source: string
  try {
    source = readFileSync(mainFile, "utf-8")
  } catch {
    return null
  }
  const cvaVariants = extractCvaVariants(source)
  const propVariants = extractPropUnionVariants(source)
  const allVariants = [...cvaVariants, ...propVariants]

  const hasDisabledProp = /\bdisabled\b\s*[?:]/.test(source)

  let hasStoriesFile = true
  let existingStories: string[] = []
  try {
    existingStories = extractExistingStories(readFileSync(storiesFile, "utf-8"))
  } catch {
    // no stories file yet
    hasStoriesFile = false
  }

  const expectedStories: string[] = []
  for (const v of allVariants) {
    for (const val of v.values) {
      if (val === "default") continue
      expectedStories.push(variantValueToStoryName(v.name, val))
    }
  }

  if (hasDisabledProp && !storyNameExists(existingStories, "Disabled")) {
    expectedStories.push("Disabled")
  }

  const seen = new Set<string>()
  const missingStories = expectedStories.filter((s) => {
    if (seen.has(s)) return false
    seen.add(s)
    return !storyNameExists(existingStories, s)
  })

  return {
    name,
    dir: componentDir,
    variants: allVariants,
    hasDisabledProp,
    hasStoriesFile,
    existingStories,
    missingStories,
  }
}

const COMPOUND_COMPONENTS = new Set([
  "accordion",
  "action-bar",
  "carousel",
  "combobox",
  "field",
  "input-otp",
  "native-select",
  "radio-group",
  "select",
  "button-group",
  "toggle-group",
  "swap",
])

function generateMissingStories(
  audit: ComponentAudit,
  componentDir: string,
): void {
  if (COMPOUND_COMPONENTS.has(audit.name)) {
    console.log(
      `    -> Skipping ${audit.name} (compound component, needs manual stories)`,
    )
    return
  }
  const storiesFile = join(componentDir, `${audit.name}.stories.tsx`)
  let source: string
  try {
    source = readFileSync(storiesFile, "utf-8")
  } catch {
    return
  }

  const newStories: string[] = []

  for (const storyName of audit.missingStories) {
    if (source.includes(`export const ${storyName}`)) continue

    let variantName = ""
    let variantValue = ""

    for (const v of audit.variants) {
      for (const val of v.values) {
        if (variantValueToStoryName(v.name, val) === storyName) {
          variantName = v.name
          variantValue = val
          break
        }
      }
      if (variantName) break
    }

    if (storyName === "Disabled") {
      newStories.push(
        `\nexport const Disabled: Story = {\n  args: { children: "Disabled", disabled: true },\n}`,
      )
    } else if (variantName && variantValue) {
      const childText = variantValue
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
      newStories.push(
        `\nexport const ${storyName}: Story = {\n  args: { children: "${childText}", ${variantName}: "${variantValue}" },\n}`,
      )
    }
  }

  if (newStories.length > 0) {
    const updatedSource = source.trimEnd() + "\n" + newStories.join("\n") + "\n"
    writeFileSync(storiesFile, updatedSource)
  }
}

function main() {
  // Components AND blocks — a block without a stories file (e.g. the
  // app-header gap) must be visible to this audit, not just variant gaps.
  const dirs = [COMPONENTS_DIR, BLOCKS_DIR]
    .flatMap((root) =>
      readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(root, d.name)),
    )
    .sort()

  const audits: ComponentAudit[] = []
  let totalMissing = 0
  let totalComponents = 0

  for (const dir of dirs) {
    const audit = auditComponent(dir)
    if (!audit) continue

    totalComponents++
    audits.push(audit)

    if (audit.missingStories.length > 0) {
      totalMissing += audit.missingStories.length
    }
  }

  console.log("\n📋 Story Coverage Audit")
  console.log("=".repeat(60))

  const noStoriesFile = audits.filter((a) => !a.hasStoriesFile)
  const incomplete = audits.filter(
    (a) => a.hasStoriesFile && a.missingStories.length > 0,
  )
  const complete = audits.filter(
    (a) =>
      a.hasStoriesFile &&
      a.missingStories.length === 0 &&
      a.variants.length > 0,
  )
  const noVariants = audits.filter(
    (a) => a.hasStoriesFile && a.variants.length === 0,
  )

  if (noStoriesFile.length > 0) {
    console.log(
      `\n❌ No stories file (${noStoriesFile.length} components/blocks):`,
    )
    for (const audit of noStoriesFile) {
      console.log(`  ${audit.name} (${audit.dir})`)
    }
  }

  if (incomplete.length > 0) {
    console.log(
      `\n❌ Missing stories (${incomplete.length} components, ${totalMissing} stories):`,
    )
    for (const audit of incomplete) {
      console.log(`\n  ${audit.name}`)
      console.log(
        `    Existing: ${audit.existingStories.join(", ") || "(none)"}`,
      )
      console.log(`    Missing:  ${audit.missingStories.join(", ")}`)
      for (const v of audit.variants) {
        console.log(
          `    ${v.source === "cva" ? "CVA" : "Prop"} ${v.name}: ${v.values.join(", ")}`,
        )
      }

      if (FIX_MODE) {
        generateMissingStories(audit, audit.dir)
        console.log(`    -> Generated ${audit.missingStories.length} stories`)
      }
    }
  }

  if (complete.length > 0) {
    console.log(`\n✅ Complete coverage (${complete.length} components):`)
    for (const audit of complete) {
      console.log(`  ${audit.name} (${audit.existingStories.length} stories)`)
    }
  }

  if (noVariants.length > 0) {
    console.log(
      `\n-- No detectable variants (${noVariants.length} components):`,
    )
    console.log(`  ${noVariants.map((a) => a.name).join(", ")}`)
  }

  console.log(`\n${"=".repeat(60)}`)
  console.log(
    `Total: ${totalComponents} components, ${totalMissing} missing stories, ${noStoriesFile.length} missing stories files`,
  )
  const hasGaps = totalMissing > 0 || noStoriesFile.length > 0
  if (!hasGaps) {
    console.log("All detectable variants have stories!")
  } else if (!FIX_MODE) {
    console.log(
      "Run with --fix to generate missing variant stories (missing stories files need manual authoring)",
    )
  }

  process.exit(hasGaps ? 1 : 0)
}

main()
