#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib"
import { NetworkStack } from "../lib/network-stack.js"
import { DataStack } from "../lib/data-stack.js"
import { AppStack } from "../lib/app-stack.js"
import { ObservabilityStack } from "../lib/observability-stack.js"
import { SecurityStack } from "../lib/security-stack.js"
import { BackupStack } from "../lib/backup-stack.js"
import { SecretsStack } from "../lib/secrets-stack.js"
import { AuditStack } from "../lib/audit-stack.js"

const app = new App()

const env = (app.node.tryGetContext("env") as string | undefined) ?? "staging"
const validEnvironments = (app.node.tryGetContext("validEnvironments") as
  | string[]
  | undefined) ?? ["staging", "production"]

if (!validEnvironments.includes(env)) {
  throw new Error(
    `Unknown env "${env}". Valid: ${validEnvironments.join(", ")}. Pass via --context env=<name>.`,
  )
}

const account = process.env.AWS_ACCOUNT_ID
const region = process.env.AWS_REGION

if (!account) {
  throw new Error(
    "AWS_ACCOUNT_ID env var is required. Locally: export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text). In CI it comes from the AWS_ACCOUNT_ID repo secret.",
  )
}

if (!region) {
  throw new Error(
    "AWS_REGION env var is required. Locally: export AWS_REGION=<your-region> (e.g. eu-central-1). In CI it comes from the AWS_REGION repo variable.",
  )
}

const stackEnv = { account, region }

const domain = process.env.APP_DOMAIN
if (!domain) {
  throw new Error(
    `APP_DOMAIN env var is required for env=${env}. In CI it comes from the APP_DOMAIN_${env.toUpperCase()} repo variable.`,
  )
}

// Admin is a distinct host, not a subdomain of the web domain: production
// admin is admin.afframe.com while web is app.afframe.com. Sourced from its
// own per-env variable so the two domains stay independent.
const adminDomain = process.env.ADMIN_DOMAIN
if (!adminDomain) {
  throw new Error(
    `ADMIN_DOMAIN env var is required for env=${env}. In CI it comes from the ADMIN_DOMAIN_${env.toUpperCase()} repo variable.`,
  )
}

// Operator email is no longer a CDK input. The deploy workflow subscribes
// the EMAIL_FORWARD_TO repo secret to the alert SNS topics out-of-band
// (aws sns subscribe --protocol email, with ::add-mask:: on the value)
// so the address never enters CFN templates / `cdk diff` snapshots / CI
// logs. See SecurityStack.killSwitchOpsTopic + ObservabilityStack.billingTopic.

// Outbound email "From" address (Resend transport). Resend rejects sends
// from any sender domain that is not exactly verified — subdomains are NOT
// auto-trusted from a parent verification. `afframe.com` is verified;
// `app-staging.afframe.com` and `app.afframe.com` are not (and would each
// need their own DNS + verification). We centralise on the verified parent
// until per-env subdomain verification lands. Override via the
// `MAIL_FROM_ADDRESS` repo secret/var if you want a different sender per env.
//
// `||` (not `??`) is deliberate: the deploy workflow passes
// `MAIL_FROM_ADDRESS: ${{ vars.MAIL_FROM_ADDRESS }}`, and when the repo
// var is unset GitHub Actions exports an empty string — `??` only
// fires on null/undefined, so an empty value would slip through and
// trip the regex below. `||` falls back on empty too.
const mailFromAddress =
  process.env.MAIL_FROM_ADDRESS?.trim() || "no-reply@afframe.com"
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailFromAddress)) {
  throw new Error(
    `MAIL_FROM_ADDRESS must be an email address; got "${mailFromAddress}".`,
  )
}

const network = new NetworkStack(app, `Network-${env}`, {
  env: stackEnv,
  envName: env,
})

const data = new DataStack(app, `Data-${env}`, {
  env: stackEnv,
  envName: env,
  vpc: network.vpc,
  dataSubnets: network.dataSubnets,
  appSecurityGroupId: network.appSecurityGroup.securityGroupId,
})

const appStack = new AppStack(app, `App-${env}`, {
  env: stackEnv,
  envName: env,
  vpc: network.vpc,
  publicSubnets: network.publicSubnets,
  appSecurityGroup: network.appSecurityGroup,
  database: data.database,
  databaseSecret: data.databaseSecret,
  appUserSecret: data.appUserSecret,
  appBucket: data.appBucket,
  webRepository: data.webRepository,
  apiRepository: data.apiRepository,
  adminRepository: data.adminRepository,
  domain,
  adminDomain,
  mailFromAddress,
})

const security = new SecurityStack(app, `Security-${env}`, {
  env: stackEnv,
  envName: env,
  appStack,
  dataStack: data,
})

new ObservabilityStack(app, `Observability-${env}`, {
  env: stackEnv,
  envName: env,
  appStack,
  dataStack: data,
  killSwitchTopic: security.killSwitchTopic,
})

new BackupStack(app, `Backup-${env}`, {
  env: stackEnv,
  envName: env,
  appStack,
  dataStack: data,
  appSecurityGroup: network.appSecurityGroup,
})

// Shared (non-per-env) bootstrap stack. Owns the Vault auto-unseal KMS CMK +
// the dedicated IAM user. Deploy once, manually: `cdk deploy SecretsBootstrap`.
// Not wired into the per-env deploy workflow because (a) it spans envs and
// (b) the per-env workflows must not be able to re-deploy or destroy it.
new SecretsStack(app, "SecretsBootstrap", { env: stackEnv })

// Shared (non-per-env) account audit stack. One CloudTrail for the whole
// account (the first management-events trail is free; per-env trails meant
// the second one billed — AFF cost review 2026-05-31, trap 4). Deploy once,
// manually: `cdk deploy Audit`. Deploy it BEFORE redeploying the per-env
// Security stacks that drop their own trails, to avoid an audit gap.
new AuditStack(app, "Audit", { env: stackEnv })

Tags.of(app).add("Environment", env)
Tags.of(app).add("Repo", "hlebtkachenko/monorepo")
Tags.of(app).add("ManagedBy", "AWS-CDK")
