import "server-only"

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import { getCorpus, specPath } from "@/lib/ai/corpus"

export const runtime = "nodejs"
export const dynamic = "force-static"

/**
 * Per-page Markdown mirror. Serves raw narrative content for any docs
 * page when the caller requests it with `Accept: text/markdown` or
 * appends `.md` to the URL. Middleware rewrites both shapes to this
 * route.
 *
 * Lookup order:
 *   1. `apps/docs/content/<path>.mdx`  (real MDX source, once Phase 1d
 *      lands)
 *   2. The narrative summary from `lib/ai/corpus.ts` (every developer
 *      page already has one; serves as the fallback today while the
 *      pages render from TSX).
 *   3. 404 plain-text response.
 *
 * `force-static` so Next pre-renders one response per known path at
 * build time. Unknown paths fall through to the runtime 404 path.
 */

const CONTENT_ROOT = join(process.cwd(), "content")

interface Ctx {
  params: Promise<{ path: string[] }>
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params
  const slug = "/" + path.join("/")

  const fsPath = join(CONTENT_ROOT, `${path.join("/")}.mdx`)
  if (existsSync(fsPath)) {
    return text(readFileSync(fsPath, "utf8"))
  }

  const narrative = corpusFragmentFor(slug)
  if (narrative) return text(narrative)

  return text(
    `# Not found\n\nNo Markdown mirror for \`${slug}\`. ` +
      `Try the HTML page at https://docs.afframe.com${slug}.\n`,
    404,
  )
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  })
}

/**
 * Find the narrative-summary slab for a given page in the Ask AI
 * corpus. The corpus is sectioned by `## /developers/<page>` headings;
 * we slice between consecutive headings.
 */
function corpusFragmentFor(slug: string): string | null {
  const full = getCorpus(specPath())
  const heading = `## ${slug}`
  const start = full.indexOf(heading)
  if (start === -1) return null
  const after = full.indexOf("\n## ", start + heading.length)
  const slab = after === -1 ? full.slice(start) : full.slice(start, after)
  return slab.trim() + "\n"
}
