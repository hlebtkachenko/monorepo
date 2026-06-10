import type { INestApplication } from "@nestjs/common"
import { VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AppModule } from "../app.module"
import { buildOpenApiDocument } from "../openapi"

/**
 * Controller <-> registry parity gate (recon F7).
 *
 * The OpenAPI spec is emitted purely from the shared registry
 * (`packages/shared/src/api/registry.ts`) — the `@nestjs/swagger`
 * decorators are inert. That means a Nest route added, renamed, or removed
 * WITHOUT a matching registry edit produces zero drift signal in the
 * `openapi-lint` / `sdk-drift` / `mcp-coverage` gates. This test closes
 * that direction: it boots the real `AppModule`, lists every mounted
 * `/v1/*` express route, and asserts set-equality (both directions) with
 * the registry document's paths.
 */

interface ExpressLayer {
  route?: {
    path: string | string[]
    methods: Record<string, boolean>
  }
}

const SPEC_METHODS = ["get", "post", "put", "patch", "delete"] as const

/**
 * `"/v1/items/:id/"` -> `"/v1/items/{id}"` — OpenAPI path-param style,
 * without the trailing slash Express 5 keeps on versioned routes.
 */
function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\/+$/, "")
}

function listMountedV1Operations(app: INestApplication): Set<string> {
  const instance = app.getHttpAdapter().getInstance() as {
    router?: { stack?: ExpressLayer[] }
    _router?: { stack?: ExpressLayer[] }
  }
  const stack = instance.router?.stack ?? instance._router?.stack ?? []
  const ops = new Set<string>()
  for (const layer of stack) {
    if (!layer.route) continue
    const paths = Array.isArray(layer.route.path)
      ? layer.route.path
      : [layer.route.path]
    for (const path of paths) {
      if (!path.startsWith("/v1/")) continue
      for (const method of SPEC_METHODS) {
        if (layer.route.methods[method]) {
          ops.add(`${method.toUpperCase()} ${toOpenApiPath(path)}`)
        }
      }
    }
  }
  return ops
}

function listSpecV1Operations(): Set<string> {
  const document = buildOpenApiDocument()
  const ops = new Set<string>()
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    if (!path.startsWith("/v1/")) continue
    for (const method of SPEC_METHODS) {
      if ((item as Record<string, unknown>)[method]) {
        ops.add(`${method.toUpperCase()} ${path}`)
      }
    }
  }
  return ops
}

describe("controller <-> registry parity", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleRef.createNestApplication()
    // Mirror main.ts: URI versioning gives the controllers their /v1 prefix.
    app.enableVersioning({ type: VersioningType.URI, prefix: "v" })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("every registered spec operation has a mounted Nest route", () => {
    const mounted = listMountedV1Operations(app)
    const missing = [...listSpecV1Operations()].filter((op) => !mounted.has(op))
    expect(
      missing,
      `Spec operations with no controller route — remove from the registry or implement the controller: ${missing.join(", ")}`,
    ).toEqual([])
  })

  it("every mounted /v1 Nest route is registered in the spec", () => {
    const spec = listSpecV1Operations()
    const unregistered = [...listMountedV1Operations(app)].filter(
      (op) => !spec.has(op),
    )
    expect(
      unregistered,
      `Controller routes missing from packages/shared/src/api/registry.ts — register them and run pnpm gen:all: ${unregistered.join(", ")}`,
    ).toEqual([])
  })

  it("sanity: the foundation surface is present on both sides", () => {
    // Guards against a silently-empty router stack making the two
    // set-difference tests vacuously green.
    const mounted = listMountedV1Operations(app)
    expect(mounted).toContain("GET /v1/ping")
    expect(mounted).toContain("POST /v1/feedback")
    expect(mounted.size).toBeGreaterThanOrEqual(4)
  })
})
