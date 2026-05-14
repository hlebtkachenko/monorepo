import {
  type CheckResourceRequest,
  type CheckResourcesResult,
} from "@cerbos/core"
import { GRPC } from "@cerbos/grpc"
import { Injectable, Logger, Module, type OnModuleInit } from "@nestjs/common"

// The Cerbos PDP runs as a sidecar in the same Fargate task at localhost:3593.
// In dev compose, it's also localhost:3593 via the `auth` profile. Override
// with CERBOS_ENDPOINT for non-local-loopback wiring (none today).
const ENDPOINT = process.env["CERBOS_ENDPOINT"] ?? "localhost:3593"

/**
 * Thin wrapper around the Cerbos gRPC client.
 *
 * L3 of the three-layer authz stack (ADR-0018 amendment 2026-05-14):
 *   L1: Postgres FORCE RLS (ADR-0010)
 *   L2: OpenFGA sidecar (port 8080 gRPC, relationship/graph checks)
 *   L3: Cerbos sidecar (port 3593 gRPC, action gates + conditional rules)
 *
 * The embedded WASM path was abandoned because Cerbos's policy→Rust→WASM
 * transpiler is closed-source and only runs inside Cerbos Hub. See ADR-0018
 * for full rationale.
 */
@Injectable()
export class CerbosService implements OnModuleInit {
  private readonly logger = new Logger(CerbosService.name)
  private client!: GRPC

  async onModuleInit(): Promise<void> {
    this.logger.log(`Connecting to Cerbos PDP at: ${ENDPOINT}`)
    // tls: false — we're talking loopback inside the Fargate task network
    // namespace, no TLS termination needed. The sidecar is unreachable from
    // outside the task (binds to its container interface, awsvpc).
    this.client = new GRPC(ENDPOINT, { tls: false })
    // Probe so failures surface at boot, not on first request. The serverInfo
    // call rejects if the PDP is unreachable.
    const info = await this.client.serverInfo()
    this.logger.log(
      `Cerbos PDP ready (version=${info.version}, commit=${info.commit})`,
    )
  }

  /**
   * Check a principal's permissions on a single resource.
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
 */
@Module({
  providers: [CerbosService],
  exports: [CerbosService],
})
export class CerbosModule {}
