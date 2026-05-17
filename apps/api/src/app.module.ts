import { Module } from "@nestjs/common"
import { HealthController } from "./health/health.controller.js"
import { V1Module } from "./v1/v1.module.js"

@Module({
  imports: [V1Module],
  controllers: [HealthController],
})
export class AppModule {}
