import type { INestApplication } from "@nestjs/common"
import { Module } from "@nestjs/common"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { Test } from "@nestjs/testing"
import supertest from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { registerDocsRoutes } from "./docs"

@Module({})
class EmptyModule {}

describe("Public API docs surface (AFF-220)", () => {
  let app: INestApplication
  let document: ReturnType<typeof SwaggerModule.createDocument>

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmptyModule],
    }).compile()

    app = moduleRef.createNestApplication()
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Test")
        .setDescription("Test")
        .setVersion("0.0.0")
        .build(),
    )
    registerDocsRoutes(app, document)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("GET /v1/openapi.json returns the document as JSON", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/v1/openapi.json")
      .expect(200)
      .expect("Content-Type", /application\/json/)

    expect(response.body).toEqual(document)
    expect(response.body.openapi).toBe("3.0.0")
  })

  it("GET /v1/docs renders Scalar API Reference (not Swagger UI)", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/v1/docs")
      .expect(200)
      .expect("Content-Type", /text\/html/)

    // Scalar-specific markers — both must appear so a silent package
    // downgrade or accidental re-introduction of SwaggerModule trips this.
    expect(response.text).toContain("Scalar.createApiReference")
    expect(response.text).toContain(
      "cdn.jsdelivr.net/npm/@scalar/api-reference",
    )
    expect(response.text).not.toContain("swagger-ui")
  })
})
