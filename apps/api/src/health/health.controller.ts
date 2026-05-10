import { Controller, Get } from "@nestjs/common"

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      buildSha: process.env.BUILD_SHA ?? "unknown",
      buildVersion: process.env.BUILD_VERSION ?? "0.0.0",
      uptimeSeconds: Math.round(process.uptime()),
    }
  }
}
