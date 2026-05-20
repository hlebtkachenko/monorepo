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
 * Session gate: matches `apps/admin`'s allowlist. Until Better Auth's
 * cross-subdomain cookie ships (Phase D2), the route is opt-in via the
 * `EDITOR_ENABLED=true` env var and falls back to 503 otherwise — no
 * accidental public exposure during the rollout window.
 */
const SPEC_URL = "https://api.afframe.com/v1/openapi.json"

export function registerEditorRoutes(app: INestApplication): void {
  const adapter = app.getHttpAdapter()
  adapter.get("/editor", (_req: Request, res: Response) => {
    if (process.env.EDITOR_ENABLED !== "true") {
      res.status(503).json({
        error: {
          code: "feature_not_enabled",
          message:
            "The spec editor is not enabled in this environment. " +
            "Set EDITOR_ENABLED=true on the api task once the admin " +
            "session-gate (Phase D2) is in place.",
        },
      })
      return
    }
    const target = `https://editor.scalar.com/?url=${encodeURIComponent(SPEC_URL)}`
    res.redirect(302, target)
  })
}
