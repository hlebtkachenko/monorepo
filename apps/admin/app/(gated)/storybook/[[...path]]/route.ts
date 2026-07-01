import { readFile } from "node:fs/promises"
import path from "node:path"
import { headers } from "next/headers"

import { auth } from "@workspace/auth/server"

import { canAccessSection } from "@/lib/capabilities"
import { getStaffRole } from "@/lib/staff-role"

import { checkAllowlist } from "../../check-allowlist"

const DEFAULT_DIR = path.resolve(process.cwd(), ".storybook-static")
const STORYBOOK_DIR = process.env.STORYBOOK_STATIC_DIR ?? DEFAULT_DIR

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
}

// Read a bundle path directly, falling back to <dir>/index.html when the path
// is a directory (readFile throws EISDIR). Reading in one call — with no prior
// stat() check — removes the check-then-use pair the CodeQL js/file-system-race
// (TOCTOU) query flags. `target` is the path actually read, used for MIME/ext.
async function loadAsset(
  filePath: string,
): Promise<{ data: Buffer; target: string }> {
  try {
    return { data: await readFile(filePath), target: filePath }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EISDIR") {
      const target = path.join(filePath, "index.html")
      return { data: await readFile(target), target }
    }
    throw e
  }
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { allowed } = await checkAllowlist(session.user.id)
  if (!allowed) return new Response("Forbidden", { status: 403 })

  // Route handlers don't run layouts, so the section-level gate must be
  // re-applied here. Storybook surfaces design-system internals to staff
  // only; non-design / non-eng roles are denied.
  const role = await getStaffRole(session.user.id)
  if (!canAccessSection(role, "/storybook")) {
    return new Response("Forbidden", { status: 403 })
  }

  const params = await ctx.params
  const parts = params.path ?? []
  const rel = parts.length === 0 ? "index.html" : parts.join("/")
  const resolved = path.resolve(STORYBOOK_DIR, rel)

  if (
    !resolved.startsWith(STORYBOOK_DIR + path.sep) &&
    resolved !== STORYBOOK_DIR
  ) {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const { data, target } = await loadAsset(resolved)
    const ext = path.extname(target).toLowerCase()

    if (ext === ".html") {
      const html = data
        .toString("utf-8")
        .replace(/<head([^>]*)>/i, `<head$1><base href="/storybook/" />`)
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, max-age=60",
        },
      })
    }

    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": "private, max-age=300",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
