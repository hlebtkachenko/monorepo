import { App } from "aws-cdk-lib"
import { Match, Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { BetaAppStack } from "../lib/beta-app-stack.js"
import { BetaDataStack } from "../lib/beta-data-stack.js"
import { NetworkStack } from "../lib/network-stack.js"
import { TEST_ACCOUNT, TEST_REGION } from "./helper.js"

const ENV_NAME = "beta"
const BETA_DOMAIN = "beta.example.com"

function buildBetaApp() {
  const app = new App({
    context: {
      [`availability-zones:account=${TEST_ACCOUNT}:region=${TEST_REGION}`]: [
        "eu-central-1a",
        "eu-central-1b",
      ],
    },
  })

  const stackEnv = { account: TEST_ACCOUNT, region: TEST_REGION }

  const network = new NetworkStack(app, `Network-${ENV_NAME}`, {
    env: stackEnv,
    envName: ENV_NAME,
  })

  const data = new BetaDataStack(app, `BetaData-${ENV_NAME}`, {
    env: stackEnv,
    envName: ENV_NAME,
    vpc: network.vpc,
    dataSubnets: network.dataSubnets,
    appSecurityGroupId: network.appSecurityGroup.securityGroupId,
  })

  const appStack = new BetaAppStack(app, `BetaApp-${ENV_NAME}`, {
    env: stackEnv,
    envName: ENV_NAME,
    vpc: network.vpc,
    publicSubnets: network.publicSubnets,
    appSecurityGroup: network.appSecurityGroup,
    database: data.database,
    databaseSecret: data.databaseSecret,
    documentsBucket: data.documentsBucket,
    documentsKey: data.documentsKey,
    repository: data.repository,
    domain: BETA_DOMAIN,
    mailFromAddress: "no-reply@example.com",
  })

  return { app, network, data, appStack }
}

describe("BetaDataStack", () => {
  const { data } = buildBetaApp()
  const template = Template.fromStack(data)

  it("runs one private single-AZ t4g.micro Postgres with 7-day backups", () => {
    template.resourceCountIs("AWS::RDS::DBInstance", 1)
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      DBInstanceClass: "db.t4g.micro",
      Engine: "postgres",
      AllocatedStorage: "20",
      StorageType: "gp3",
      MultiAZ: false,
      // The beta RDS must never be reachable from outside the VPC — the whole
      // migrations-in-the-entrypoint design (plan Part 2 §3) depends on it.
      PubliclyAccessible: false,
      StorageEncrypted: true,
      BackupRetentionPeriod: 7,
    })
  })

  it("issues exactly one credentials secret (beta has no RLS role split)", () => {
    template.resourceCountIs("AWS::SecretsManager::Secret", 1)
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      GenerateSecretString: Match.objectLike({
        // Alphanumeric: BetaAppStack interpolates the password into a
        // postgres:// URL in /bin/sh without urlencoding.
        ExcludePunctuation: true,
        PasswordLength: 32,
      }),
    })
  })

  it("creates a single immutable-tag ECR repository under the monorepo-beta-* prefix", () => {
    template.resourceCountIs("AWS::ECR::Repository", 1)
    template.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "monorepo-beta-beta",
      ImageTagMutability: "IMMUTABLE",
    })
  })

  it("keeps the documents bucket private, versioned and CMK-encrypted", () => {
    template.resourceCountIs("AWS::S3::Bucket", 1)
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: "Enabled" },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({
            BucketKeyEnabled: true,
            ServerSideEncryptionByDefault: Match.objectLike({
              SSEAlgorithm: "aws:kms",
            }),
          }),
        ],
      },
    })
    // No CORS rules: the browser never talks to S3 directly (no presigned
    // URLs — plan Part 4), so an allowed-origin list would be dead surface.
    template.hasResourceProperties("AWS::S3::Bucket", {
      CorsConfiguration: Match.absent(),
    })
  })
})

describe("BetaAppStack", () => {
  const { appStack } = buildBetaApp()
  const template = Template.fromStack(appStack)

  it("runs one Fargate service with a 256/512 arm64 task", () => {
    template.resourceCountIs("AWS::ECS::Service", 1)
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Cpu: "256",
      Memory: "512",
      RuntimePlatform: {
        CpuArchitecture: "ARM64",
        OperatingSystemFamily: "LINUX",
      },
    })
  })

  it("defines exactly two containers: the beta app and its own cloudflared", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const containers = Object.values(taskDefs)[0]?.Properties
      ?.ContainerDefinitions as { Name: string }[]
    expect(containers.map((c) => c.Name).sort()).toEqual([
      "beta",
      "cloudflared",
    ])
  })

  it("reads the tunnel token from beta's own SSM SecureString parameter", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const containers = Object.values(taskDefs)[0]?.Properties
      ?.ContainerDefinitions as {
      Name: string
      Secrets?: { Name: string; ValueFrom: unknown }[]
    }[]
    const tunnel = containers.find((c) => c.Name === "cloudflared")
    const token = tunnel?.Secrets?.find((s) => s.Name === "TUNNEL_TOKEN")
    expect(JSON.stringify(token?.ValueFrom)).toContain(
      "parameter/monorepo/beta/cloudflare-tunnel-token",
    )
  })

  it("never sets a cross-subdomain auth cookie domain", () => {
    // A leading-dot `.afframe.com` cookie here would collide with the main
    // app's SSO cookie on the same apex (plan Part 1 addendum / B4-2).
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const containers = Object.values(taskDefs)[0]?.Properties
      ?.ContainerDefinitions as { Environment?: { Name: string }[] }[]
    const names = containers.flatMap((c) =>
      (c.Environment ?? []).map((e) => e.Name),
    )
    expect(names).not.toContain("BETTER_AUTH_COOKIE_DOMAIN")
  })
})
