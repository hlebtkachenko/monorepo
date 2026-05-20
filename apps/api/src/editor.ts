import type { INestApplication } from "@nestjs/common"
import type { Request, Response } from "express"

/**
 * Spec editor mount at `/editor`. Scalar ships the editor as a hosted web
 * tool (editor.scalar.com), not an npm package, so this route is a 302
 * redirect that pre-fills the live spec URL.
 *
 * The redirect target is public — anyone can paste the OpenAPI spec URL
 * into editor.scalar.com directly without going through this host — so
 * the redirect itself adds no exposure beyond what `/v1/openapi.json`
 * already grants. No auth gate.
 */
const SPEC_URL = "https://api.afframe.com/v1/openapi.json"

export function registerEditorRoutes(app: INestApplication): void {
  const adapter = app.getHttpAdapter()
  adapter.get("/editor", (_req: Request, res: Response) => {
    const target = `https://editor.scalar.com/?url=${encodeURIComponent(SPEC_URL)}`
    res.redirect(302, target)
  })
}
