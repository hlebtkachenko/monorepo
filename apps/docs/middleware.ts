import { NextResponse, type NextRequest } from "next/server"

/**
 * Content-negotiation middleware for the docs site.
 *
 * Two surface shapes per page:
 *   - HTML: `https://docs.afframe.com/developers/quickstart` (default).
 *   - Markdown: `https://docs.afframe.com/developers/quickstart.md` OR
 *     the same path with `Accept: text/markdown`.
 *
 * Both `.md`-suffixed paths and Accept-header requests rewrite to the
 * internal `/api/raw/<path>` handler that streams the underlying MDX /
 * narrative file as plain text. Browsers keep seeing HTML; LLMs and
 * crawlers that ask for Markdown get the source they want.
 *
 * Matcher excludes static assets, the OG image route, and the existing
 * `/api/*` endpoints so they don't get caught.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.endsWith(".md")) {
    const url = req.nextUrl.clone()
    url.pathname = `/api/raw${pathname.replace(/\.md$/, "")}`
    return NextResponse.rewrite(url)
  }

  const accept = req.headers.get("accept") ?? ""
  if (accept.includes("text/markdown") || accept.includes("text/plain")) {
    const url = req.nextUrl.clone()
    url.pathname = `/api/raw${pathname.endsWith("/") ? pathname.slice(0, -1) : pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api/|_next/|opengraph-image|favicon|robots|sitemap|llms|.*\\.).*)",
    "/:path*.md",
  ],
}
