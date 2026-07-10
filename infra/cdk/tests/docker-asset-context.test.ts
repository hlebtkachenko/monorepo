import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { buildTestApp } from "./helper.js"

interface DockerAsset {
  readonly displayName: string
  readonly source: { readonly directory: string }
}

function filesBelow(root: string, current: string = root): string[] {
  return readdirSync(current).flatMap((name) => {
    const path = join(current, name)
    return statSync(path).isDirectory()
      ? filesBelow(root, path)
      : [relative(root, path)]
  })
}

function assetFiles(outdir: string, manifestName: string, name: string) {
  const manifest = JSON.parse(
    readFileSync(join(outdir, manifestName), "utf8"),
  ) as { dockerImages: Record<string, DockerAsset> }
  const asset = Object.values(manifest.dockerImages).find(
    (candidate) => candidate.displayName === name,
  )
  expect(asset, `${name} missing from ${manifestName}`).toBeDefined()
  return filesBelow(join(outdir, asset!.source.directory)).sort()
}

describe("Docker asset contexts", () => {
  it("stages only files consumed by helper images", () => {
    const outdir = mkdtempSync(join(tmpdir(), "cdk-assets-"))
    try {
      buildTestApp("assets", outdir).app.synth()

      const backup = assetFiles(
        outdir,
        "Backup-assets.assets.json",
        "BackupImage",
      )
      expect(backup).toEqual([
        ".dockerignore",
        "infra/Dockerfile.backup",
        "infra/scripts/pg-dump-nightly.sh",
        "infra/scripts/restore-drill.sh",
        "infra/scripts/wal-archive.sh",
      ])

      const openfga = assetFiles(
        outdir,
        "App-assets.assets.json",
        "OpenfgaBootstrapImage",
      )
      expect(openfga).toEqual([
        ".dockerignore",
        ".npmrc",
        "eslint.config.js",
        "infra/Dockerfile.openfga-bootstrap",
        "infra/openfga/bootstrap.mjs",
        "infra/openfga/model.fga",
        "infra/openfga/package.json",
        "infra/scripts/openfga-bootstrap-init.sh",
        "package.json",
        "packages/eslint-config/package.json",
        "packages/typescript-config/package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "tsconfig.json",
        "turbo.json",
      ])

      const migrate = assetFiles(
        outdir,
        "App-assets.assets.json",
        "DbMigrateImage",
      )
      const migrationDirectory = join(
        process.cwd(),
        "..",
        "..",
        "packages/db/migrations",
      )
      const migrationFiles = readdirSync(migrationDirectory)
        .filter((file) => file.endsWith(".sql"))
        .map((file) => `packages/db/migrations/${file}`)
        .sort()
      expect(migrate).toEqual([
        ".dockerignore",
        "infra/Dockerfile.migrate",
        "infra/scripts/apply-migrations-init.sh",
        ...migrationFiles,
      ])
    } finally {
      rmSync(outdir, { recursive: true, force: true })
    }
  })
})
