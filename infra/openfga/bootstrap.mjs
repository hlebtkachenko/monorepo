#!/usr/bin/env node
/**
 * infra/openfga/bootstrap.mjs
 *
 * Idempotent OpenFGA store + model bootstrap.
 *
 * Usage:
 *   node infra/openfga/bootstrap.mjs --env dev
 *   OPENFGA_API_URL=http://localhost:8080 node infra/openfga/bootstrap.mjs --env staging
 *
 * Behavior:
 *   1. Connects to OpenFGA at OPENFGA_API_URL (default: http://localhost:8080).
 *   2. Checks if a store named `monorepo-{env}` already exists.
 *      If yes, reuses its ID. If no, creates it.
 *   3. Writes the model from model.fga to the store. Returns a new model_id.
 *   4. Outputs store_id + model_id to:
 *      - SSM Parameter Store (/monorepo/{env}/openfga/store-id + model-id)
 *        when AWS_REGION env var is set and @aws-sdk/client-ssm is available.
 *      - stdout (copy to .env.local) when running locally without AWS creds.
 *
 * Exit codes:
 *   0 — success
 *   1 — any API failure
 *
 * Log format: JSON lines to stdout (CloudWatch compatible).
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

import { OpenFgaClient } from "@openfga/sdk"
import { transformer } from "@openfga/syntax-transformer"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--env" && argv[i + 1]) {
      args.env = argv[++i]
    }
  }
  return args
}

const { env: envArg } = parseArgs(process.argv)
const MONOREPO_ENV = envArg ?? process.env.MONOREPO_ENV ?? "dev"
// "production" mirrors AppStack's envName mapping (see app-stack.ts SSM
// reads at /monorepo/${envName}/openfga/store-id). Earlier "prod" was
// rejected by CDK because SSM paths use the long form.
const ALLOWED_ENVS = new Set(["dev", "staging", "production"])
const OPENFGA_API_URL = process.env.OPENFGA_API_URL ?? "http://localhost:8080"
const STORE_NAME = `monorepo-${MONOREPO_ENV}`

// ─── Structured logging ──────────────────────────────────────────────────────

function log(level, message, extra = {}) {
  process.stdout.write(
    JSON.stringify({ level, message, env: MONOREPO_ENV, ...extra }) + "\n",
  )
}

// ─── OpenFGA client ───────────────────────────────────────────────────────────

// @openfga/sdk + @openfga/syntax-transformer are declared as dependencies
// of THIS package (infra/openfga/package.json). Plain ES imports above
// resolve via the standard node_modules lookup whether the script runs
// from a developer's pnpm install or inside the openfga-bootstrap init
// container's Docker image. The previous createRequire(apps/api/...)
// hack tied this script to apps/api's hoisting layout — removed.
const fga = new OpenFgaClient({
  apiUrl: OPENFGA_API_URL,
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findOrCreateStore(name) {
  log("info", "Listing stores to check for existing store", {
    store_name: name,
  })

  let continuationToken = undefined
  do {
    const response = await fga.listStores(
      continuationToken ? { continuationToken } : {},
    )
    const stores = response.stores ?? []
    const existing = stores.find((s) => s.name === name)
    if (existing) {
      log("info", "Found existing store, reusing", {
        store_id: existing.id,
        store_name: name,
      })
      return existing.id
    }
    continuationToken = response.continuation_token
  } while (continuationToken)

  log("info", "Store not found, creating", { store_name: name })
  const created = await fga.createStore({ name })
  log("info", "Store created", { store_id: created.id, store_name: name })
  return created.id
}

async function writeModel(storeId, modelDsl) {
  log("info", "Writing authorization model to store", { store_id: storeId })
  const clientWithStore = new OpenFgaClient({
    apiUrl: OPENFGA_API_URL,
    storeId,
  })

  // @openfga/syntax-transformer exports `transformer.transformDSLToJSONObject`
  // (NOT a top-level transformDSLToJSON). The Object variant returns a parsed
  // object — required by writeAuthorizationModel; the String variant returns
  // a serialized JSON string the SDK would reject.
  // `transformer` is required at the top of this file via createRequire so the
  // workspace-resolved package surfaces a clear error early.
  const modelJson = transformer.transformDSLToJSONObject(modelDsl)

  const result = await clientWithStore.writeAuthorizationModel(modelJson)
  const modelId = result.authorization_model_id
  log("info", "Authorization model written", {
    store_id: storeId,
    model_id: modelId,
  })
  return modelId
}

// ─── SSM output (when AWS_REGION is set) ─────────────────────────────────────

async function writeToSSM(env, storeId, modelId) {
  let SSMClient, PutParameterCommand
  try {
    const ssmModule = await import("@aws-sdk/client-ssm")
    SSMClient = ssmModule.SSMClient
    PutParameterCommand = ssmModule.PutParameterCommand
  } catch {
    log("warn", "@aws-sdk/client-ssm not available, falling back to stdout")
    return false
  }

  const client = new SSMClient({ region: process.env.AWS_REGION })

  for (const [suffix, value] of [
    ["store-id", storeId],
    ["model-id", modelId],
  ]) {
    const name = `/monorepo/${env}/openfga/${suffix}`
    log("info", "Writing SSM parameter", { name, value })
    await client.send(
      new PutParameterCommand({
        Name: name,
        Value: value,
        Type: "String",
        Overwrite: true,
        Description: `OpenFGA ${suffix} for monorepo ${env}`,
      }),
    )
    log("info", "SSM parameter written", { name })
  }
  return true
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!ALLOWED_ENVS.has(MONOREPO_ENV)) {
    log("error", "Invalid --env value", {
      env: MONOREPO_ENV,
      allowed: [...ALLOWED_ENVS],
    })
    process.exit(1)
  }

  log("info", "Starting OpenFGA bootstrap", {
    api_url: OPENFGA_API_URL,
    store_name: STORE_NAME,
  })

  // Read model DSL from disk
  const modelPath = join(__dirname, "model.fga")
  let modelDsl
  try {
    modelDsl = readFileSync(modelPath, "utf8")
  } catch (err) {
    log("error", "Cannot read model.fga", {
      path: modelPath,
      error: String(err),
    })
    process.exit(1)
  }

  let storeId, modelId
  try {
    storeId = await findOrCreateStore(STORE_NAME)
    modelId = await writeModel(storeId, modelDsl)
  } catch (err) {
    log("error", "OpenFGA API call failed", { error: String(err) })
    process.exit(1)
  }

  // Write to SSM if AWS creds available; otherwise print to stdout
  const useSSM = Boolean(process.env.AWS_REGION)
  if (useSSM) {
    try {
      const wrote = await writeToSSM(MONOREPO_ENV, storeId, modelId)
      if (!wrote) {
        // Fallback to stdout
        printOutputs(storeId, modelId)
      }
    } catch (err) {
      log("error", "SSM write failed, printing to stdout instead", {
        error: String(err),
      })
      printOutputs(storeId, modelId)
    }
  } else {
    printOutputs(storeId, modelId)
  }

  log("info", "Bootstrap complete")
}

function printOutputs(storeId, modelId) {
  log("info", "SSM not available — add these to .env.local", {
    OPENFGA_STORE_ID: storeId,
    OPENFGA_MODEL_ID: modelId,
  })
  // Also write in a format easy to copy
  process.stdout.write(
    `\nOPENFGA_STORE_ID=${storeId}\nOPENFGA_MODEL_ID=${modelId}\n`,
  )
}

main().catch((err) => {
  log("error", "Unexpected error", { error: String(err) })
  process.exit(1)
})
