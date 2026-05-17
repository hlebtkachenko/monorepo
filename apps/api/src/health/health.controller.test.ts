import { Test } from "@nestjs/testing"
import { INestApplication } from "@nestjs/common"
import supertest from "supertest"
import { describe, it, beforeAll, afterAll, expect } from "vitest"
import { HealthController } from "./health.controller"

describe("HealthController (smoke)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile()

    // HealthController itself declares `@Controller({ path: "api", … })`,
    // so the route resolves to `/api/health` without an extra global prefix.
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("GET /api/health returns 200 with status ok", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/api/health")
      .expect(200)

    expect(response.body).toMatchObject({ status: "ok" })
  })
})
