import type { INestApplication } from "@nestjs/common"
import type { Request, Response } from "express"

/**
 * Spec editor mount at `/editor`. The plan calls for embedding the
 * Scalar Editor, but Scalar ships the editor as a hosted web tool
 * (editor.scalar.com), not an npm package — so this mount redirects
 * authenticated operators to the hosted editor pre-filled with the
 * live spec URL. The hosted editor reads the spec via the URL param
 * and writes back to a Scalar-side draft; we ingest changes via the
 * existing registry-driven workflow rather than a server-side save.
 *
 * Session gate is NOT yet wired. The route is opt-in via the
 * `EDITOR_ENABLED=true` env var until the admin session check lands.
 * Cross-subdomain cookies are in place; what's missing is the
 * `withAdmin(req)` helper that reads the Better Auth session and
 * confirms membership in `ADMIN_WORKSPACE_ALLOWLIST`. Once that helper
 * exists, drop `EDITOR_ENABLED` and run the check unconditionally. Do
 * not flip `EDITOR_ENABLED=true` in production before then; that would
 * publish the redirect openly.
 */
const SPEC_URL = "https://api.afframe.com/v1/openapi.json"

export function registerEditorRoutes(app: INestApplication): void {
  const adapter = app.getHttpAdapter()
  adapter.get("/editor", (_req: Request, res: Response) => {
    if (process.env.EDITOR_ENABLED !== "true") {
      res.status(503).json({
        error: {
          code: "feature_not_enabled",
          message: "The spec editor is not enabled in this environment.",
        },
      })
      return
    }
    const target = `https://editor.scalar.com/?url=${encodeURIComponent(SPEC_URL)}`
    res.redirect(302, target)
  })
}
