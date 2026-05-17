import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common"

/**
 * Version-neutral health endpoint at `/api/health`. The Fargate container
 * healthcheck (apps/api/Dockerfile) and the ECS `essential` api container
 * both depend on this exact path — it must stay `/api/health` regardless of
 * the URI versioning applied to the public `/v1/*` surface.
 */
@Controller({ path: "api", version: VERSION_NEUTRAL })
export class HealthController {
  @Get("health")
  check() {
    return {
      status: "ok",
      buildSha: process.env.BUILD_SHA ?? "unknown",
      buildVersion: process.env.BUILD_VERSION ?? "0.0.0",
      uptimeSeconds: Math.round(process.uptime()),
    }
  }
}
