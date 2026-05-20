import type { INestApplication } from "@nestjs/common"
import { Module } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import supertest from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { registerDocsRoutes } from "./docs"
import { buildOpenApiDocument } from "./openapi"

@Module({})
class EmptyModule {}

describe("Public API docs surface", () => {
  let app: INestApplication
  let document: ReturnType<typeof buildOpenApiDocument>

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmptyModule],
    }).compile()

    app = moduleRef.createNestApplication()
    document = buildOpenApiDocument()
    registerDocsRoutes(app, document)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("GET /v1/openapi.json returns the registry-built document as JSON", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/v1/openapi.json")
      .expect(200)
      .expect("Content-Type", /application\/json/)

    expect(response.body).toEqual(document)
    expect(response.body.openapi).toBe("3.1.0")
    // Spec is registry-driven: paths and components come from
    // packages/shared/src/api/registry.ts, not the nestjs-swagger reflector.
    expect(Object.keys(response.body.paths)).toContain("/v1/ping")
    expect(response.body.components.responses).toHaveProperty("Unauthorized")
    expect(response.body.components.responses).toHaveProperty("RateLimited")
  })

  it("GET /v1/docs 301-redirects to root", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/v1/docs")
      .expect(301)

    expect(response.headers.location).toBe("/")
  })

  it("root mount is path-exact — does NOT intercept /v1/* routes", async () => {
    // Regression guard: `app.use("/", apiReference(...))` would silently
    // intercept every API path (the Scalar handler responds unconditionally
    // without calling next()), breaking the entire public surface. The mount
    // MUST be `adapter.get("/", ...)` — path-exact GET binding.
    //
    // For paths under /v1 that no controller in this test module registers,
    // Express must NOT find a match and must NOT fall through to the docs
    // page. Supertest sees a 404, not a 200 text/html.
    await supertest(app.getHttpServer())
      .get("/v1/some-unregistered-path")
      .expect((res) => {
        // The exact status depends on Nest's default 404; the key invariant
        // is "not the Scalar HTML page". A 200 text/html here means the
        // bug regressed.
        if (
          res.status === 200 &&
          /text\/html/.test(res.headers["content-type"] ?? "")
        ) {
          throw new Error(
            "Root Scalar mount intercepted /v1/* — the catch-all bug returned.",
          )
        }
      })
  })

  it("GET / renders Scalar API Reference with the full surface configured", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/")
      .expect(200)
      .expect("Content-Type", /text\/html/)

    // Scalar bootstrap markers — both must appear so a silent package
    // downgrade or accidental re-introduction of Swagger UI trips this.
    expect(response.text).toContain("Scalar.createApiReference")
    expect(response.text).toContain(
      "cdn.jsdelivr.net/npm/@scalar/api-reference",
    )
    expect(response.text).not.toContain("swagger-ui")

    // Full-surface assertions: FINMAP-style root mount, bearer-default auth,
    // curl as the default request builder, modern layout, persisted auth.
    // A regression on any of these silently strips meaningful surface from
    // the docs page.
    expect(response.text).toContain('"layout": "modern"')
    expect(response.text).toContain('"persistAuth": true')
    expect(response.text).toContain('"preferredSecurityScheme": "bearer"')
    expect(response.text).toContain('"targetKey": "shell"')
    expect(response.text).toContain('"clientKey": "curl"')
    expect(response.text).toContain("api.afframe.com")
    expect(response.text).toContain("api-staging.afframe.com")
  })
})
