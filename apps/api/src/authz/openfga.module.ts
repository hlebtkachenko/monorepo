import { OpenFgaClient } from "@openfga/sdk"
import { Injectable, Logger, Module, type OnModuleInit } from "@nestjs/common"

/**
 * NestJS wrapper around the OpenFGA SDK client.
 *
 * L2 of the three-layer authz stack (ADR-0018):
 *   L1: Postgres FORCE RLS (ADR-0010)
 *   L2: OpenFGA sidecar — relationship/graph checks, ListObjects, ad-hoc shares
 *   L3: Cerbos sidecar (gRPC :3593)
 *
 * The sidecar runs in the same Fargate task at localhost:8080 (HTTP).
 * store_id and model_id come from SSM (populated by infra/openfga/bootstrap.mjs
 * before the first cdk deploy of App-{env}). They are NOT secrets — just
 * identifiers — so SSM Standard is fine.
 *
 * Re-running bootstrap.mjs rotates model_id (see infra/openfga/README.md).
 * The api reads OPENFGA_MODEL_ID from env at boot, so a Fargate task
 * restart picks up the new pin after each bootstrap re-run.
 */
@Injectable()
export class OpenFgaService implements OnModuleInit {
  private readonly logger = new Logger(OpenFgaService.name)
  private client!: OpenFgaClient

  async onModuleInit(): Promise<void> {
    const apiUrl = process.env["OPENFGA_API_URL"]
    const storeId = process.env["OPENFGA_STORE_ID"]
    const modelId = process.env["OPENFGA_MODEL_ID"]

    if (!apiUrl || !storeId || !modelId) {
      throw new Error(
        "OpenFgaService missing required env. Set OPENFGA_API_URL, OPENFGA_STORE_ID, OPENFGA_MODEL_ID. " +
          "In production, these come from SSM /monorepo/{env}/openfga/{store-id,model-id} via the ECS task definition (see infra/cdk/lib/app-stack.ts).",
      )
    }

    this.logger.log(`Connecting to OpenFGA at: ${apiUrl} (store=${storeId})`)
    this.client = new OpenFgaClient({
      apiUrl,
      storeId,
      authorizationModelId: modelId,
    })

    // Probe at boot so an unreachable sidecar fails on startup, not on the
    // first authz check.
    await this.client.readAuthorizationModel({ authorizationModelId: modelId })
    this.logger.log("OpenFGA client ready")
  }

  /**
   * Underlying SDK client. Exposed for AuthzModule (Commit 10) to wire into
   * the AuthGuard pipeline.
   */
  getClient(): OpenFgaClient {
    return this.client
  }

  /**
   * Check whether a principal holds a relation on an object.
   *
   * @example
   * ```typescript
   * const ok = await this.openfga.check({
   *   user: `user:${userId}`,
   *   relation: "viewer",
   *   object: `invoice:${invoiceId}`,
   * })
   * if (!ok) throw new ForbiddenException()
   * ```
   */
  async check(params: {
    user: string
    relation: string
    object: string
    contextualTuples?: Array<{ user: string; relation: string; object: string }>
  }): Promise<boolean> {
    const result = await this.client.check({
      user: params.user,
      relation: params.relation,
      object: params.object,
      ...(params.contextualTuples && {
        contextualTuples: params.contextualTuples,
      }),
    })
    return result.allowed === true
  }
}

@Module({
  providers: [OpenFgaService],
  exports: [OpenFgaService],
})
export class OpenFgaModule {}
