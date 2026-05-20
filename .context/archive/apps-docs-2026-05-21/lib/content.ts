import "server-only"

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import matter from "gray-matter"

/**
 * Build-time MDX content loader.
 *
 * Pages author as `apps/docs/content/<section>/<slug>.mdx` with
 * frontmatter:
 *
 *   ---
 *   title: ...
 *   description: ...
 *   intro: ...      (optional — surfaced as the hero subhead)
 *   ---
 *
 * `loadContent("developers", "quickstart")` returns the parsed
 * frontmatter + raw MDX body. `listContent("developers")` enumerates
 * the section's pages for `generateStaticParams` + sitemap.
 *
 * No runtime read on the hot path — every consumer is `force-static`.
 */

// Two possible roots depending on how the process was launched:
//   - `pnpm --filter docs dev` / `next start`  → cwd = `apps/docs/`
//   - `node apps/docs/server.js` (standalone)  → cwd = `/app/`, files at
//     `/app/apps/docs/content/`
// Pick whichever exists at module-load time. `process.cwd()` is stable
// for the process lifetime, so the check runs once.
const CONTENT_ROOT = (() => {
  const devRoot = join(process.cwd(), "content")
  if (existsSync(devRoot)) return devRoot
  return join(process.cwd(), "apps", "docs", "content")
})()

export interface ContentFrontmatter {
  title: string
  description?: string
  intro?: string
}

export interface ContentPage {
  slug: string
  frontmatter: ContentFrontmatter
  body: string
}

export function loadContent(section: string, slug: string): ContentPage | null {
  try {
    const raw = readFileSync(join(CONTENT_ROOT, section, `${slug}.mdx`), "utf8")
    const parsed = matter(raw)
    return {
      slug,
      frontmatter: parsed.data as ContentFrontmatter,
      body: parsed.content,
    }
  } catch {
    return null
  }
}

export function listContent(section: string): ContentPage[] {
  const dir = join(CONTENT_ROOT, section)
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => f.replace(/\.mdx$/, ""))
      .map((slug) => loadContent(section, slug))
      .filter((p): p is ContentPage => p !== null)
  } catch {
    return []
  }
}
