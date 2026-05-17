import { Test } from "@nestjs/testing"
import { INestApplication } from "@nestjs/common"
import supertest from "supertest"
import { describe, it, beforeAll, afterAll, expect } from "vitest"
import { HealthController } from "./health.controller.js"

describe("HealthController (smoke)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile()

    app = module.createNestApplication()
    app.setGlobalPrefix("api")
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
