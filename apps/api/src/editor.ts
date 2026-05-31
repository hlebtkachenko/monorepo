import type { INestApplication } from "@nestjs/common"
import type { Request, Response } from "express"

/**
 * Spec editor mount at `/editor`. Scalar ships the editor as a hosted web
 * tool (editor.scalar.com), not an npm package, so this route is a 302
 * redirect that pre-fills the live spec URL.
 *
 * The spec URL is derived per-environment from `PUBLIC_API_URL`
 * (`api.afframe.com` in prod, `api-staging.afframe.com` in staging) so a
 * staging contributor clicking `/editor` edits the staging spec, not
 * prod. Falls back to prod when the env var is unset (local dev points
 * at the published prod spec, which is fine for editor preview).
 *
 * The redirect target is public — anyone can paste the OpenAPI spec URL
 * into editor.scalar.com directly without going through this host — so
 * the redirect itself adds no exposure beyond what `/v1/openapi.json`
 * already grants. No auth gate.
 */
const DEFAULT_API_URL = "https://api.afframe.com"

function resolveSpecUrl(): string {
  const base = process.env.PUBLIC_API_URL?.trim() || DEFAULT_API_URL
  return `${base.replace(/\/$/, "")}/v1/openapi.json`
}

export function registerEditorRoutes(app: INestApplication): void {
  const adapter = app.getHttpAdapter()
  adapter.get("/editor", (_req: Request, res: Response) => {
    const target = `https://editor.scalar.com/?url=${encodeURIComponent(resolveSpecUrl())}`
    res.redirect(302, target)
  })
}
