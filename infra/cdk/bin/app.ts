#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib"
import { NetworkStack } from "../lib/network-stack.js"
import { DataStack } from "../lib/data-stack.js"
import { AppStack } from "../lib/app-stack.js"
import { ObservabilityStack } from "../lib/observability-stack.js"
import { BillingAlarmsStack } from "../lib/billing-alarms-stack.js"
import { SecurityStack } from "../lib/security-stack.js"
import { BackupStack } from "../lib/backup-stack.js"

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
const region = process.env.AWS_REGION ?? "eu-central-1"

if (!account) {
  throw new Error(
    "AWS_ACCOUNT_ID env var is required. Locally: export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text). In CI it comes from the AWS_ACCOUNT_ID repo secret.",
  )
}

const stackEnv = { account, region }

const domain = process.env.APP_DOMAIN
if (!domain) {
  throw new Error(
    `APP_DOMAIN env var is required for env=${env}. In CI it comes from the APP_DOMAIN_${env.toUpperCase()} repo variable.`,
  )
}

const alertEmail = process.env.ALERT_EMAIL ?? "g1053015@icloud.com"

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
  appBucket: data.appBucket,
  webRepository: data.webRepository,
  apiRepository: data.apiRepository,
  domain,
})

const security = new SecurityStack(app, `Security-${env}`, {
  env: stackEnv,
  envName: env,
  appStack,
  dataStack: data,
  alertEmail,
})

new ObservabilityStack(app, `Observability-${env}`, {
  env: stackEnv,
  envName: env,
  appStack,
  dataStack: data,
  alertEmail,
  killSwitchTopic: security.killSwitchTopic,
})

new BillingAlarmsStack(app, `BillingAlarms-${env}`, {
  env: { account, region: "us-east-1" },
  envName: env,
  alertEmail,
})

new BackupStack(app, `Backup-${env}`, {
  env: stackEnv,
  envName: env,
  appStack,
  dataStack: data,
  appSecurityGroup: network.appSecurityGroup,
})

Tags.of(app).add("Environment", env)
Tags.of(app).add("Repo", "hlebtkachenko/monorepo")
Tags.of(app).add("ManagedBy", "AWS-CDK")
