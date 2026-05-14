import {
  type CheckResourceRequest,
  type CheckResourcesResult,
} from "@cerbos/core"
import { Embedded, Loader } from "@cerbos/embedded"
import { Injectable, Logger, Module, type OnModuleInit } from "@nestjs/common"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

// Path to the WASM bundle compiled at Docker build time via infra/cerbos/build.sh.
// In production the bundle lives at /app/cerbos-bundle.wasm (see Dockerfile COPY step).
// In development or CI, set CERBOS_BUNDLE_PATH to an absolute path to override.
const BUNDLE_PATH =
  process.env["CERBOS_BUNDLE_PATH"] ?? resolve("/app/cerbos-bundle.wasm")

/**
 * Thin wrapper around the Cerbos embedded client.
 *
 * Loaded once at module init from the pre-compiled WASM bundle.
 * All policy decisions are in-process — no network call at runtime.
 *
 * This module provides L3 of the three-layer authz stack (ADR-0018):
 *   L1: Postgres FORCE RLS
 *   L2: OpenFGA (relationship/graph checks, Commit 8-9)
 *   L3: Cerbos embedded (action gates + conditional rules)
 */
@Injectable()
export class CerbosService implements OnModuleInit {
  private readonly logger = new Logger(CerbosService.name)
  private client!: Embedded

  async onModuleInit(): Promise<void> {
    this.logger.log(`Loading Cerbos bundle from: ${BUNDLE_PATH}`)
    const wasmBytes = await readFile(BUNDLE_PATH)
    const loader = new Loader(wasmBytes.buffer as ArrayBuffer)
    this.client = new Embedded(loader)
    await loader.active()
    this.logger.log("Cerbos embedded PDP ready")
  }

  /**
   * Check a principal's permissions on a single resource.
   *
   * @param request - The Cerbos CheckResourceRequest (principal, resource, actions).
   * @returns CheckResourcesResult with per-action allow/deny decisions.
   *
   * @example
   * ```typescript
   * const result = await this.cerbos.checkResource({
   *   principal: { id: userId, roles: ["org_member"] },
   *   resource: { kind: "invoice", id: invoiceId, attr: { locked: false } },
   *   actions: ["edit", "delete"],
   * })
   * if (!result.isAllowed("edit")) throw new ForbiddenException()
   * ```
   */
  async checkResource(
    request: CheckResourceRequest,
  ): Promise<CheckResourcesResult> {
    return this.client.checkResource(request)
  }
}

/**
 * NestJS module that provides the CerbosService singleton.
 *
 * Import CerbosModule into any feature module that needs action-gate checks.
 * AuthzModule (Commit 10) will re-export both CerbosModule and OpenFGAModule
 * as a combined authz facade.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [CerbosModule],
 *   controllers: [InvoiceController],
 * })
 * export class InvoiceModule {}
 * ```
 */
@Module({
  providers: [CerbosService],
  exports: [CerbosService],
})
export class CerbosModule {}
