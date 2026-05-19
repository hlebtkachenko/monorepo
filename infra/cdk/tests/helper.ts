import { App } from "aws-cdk-lib"
import { AppStack } from "../lib/app-stack.js"
import { BackupStack } from "../lib/backup-stack.js"
import { DataStack } from "../lib/data-stack.js"
import { NetworkStack } from "../lib/network-stack.js"
import { ObservabilityStack } from "../lib/observability-stack.js"
import { SecurityStack } from "../lib/security-stack.js"

export const TEST_ACCOUNT = "123456789012"
export const TEST_REGION = "eu-central-1"
export const TEST_DOMAIN = "test.example.com"
// Deliberately NOT a subdomain of TEST_DOMAIN — proves adminDomain is an
// independent value, not derived from the web domain.
export const TEST_ADMIN_DOMAIN = "admin-console.example.net"
export const TEST_ALERT_EMAIL = "test@example.com"
export const TEST_ENV_NAME = "test"

interface BuiltApp {
  readonly app: App
  readonly network: NetworkStack
  readonly data: DataStack
  readonly appStack: AppStack
  readonly security: SecurityStack
  readonly observability: ObservabilityStack
  readonly backup: BackupStack
}

export const TEST_CLOUDFLARE_TUNNEL_SECRET_ARN = `arn:aws:secretsmanager:${TEST_REGION}:${TEST_ACCOUNT}:secret:monorepo-${TEST_ENV_NAME}-cloudflare-tunnel-token-AbCdEf`
export const TEST_RESEND_API_KEY_SECRET_ARN = `arn:aws:secretsmanager:${TEST_REGION}:${TEST_ACCOUNT}:secret:monorepo-${TEST_ENV_NAME}-resend-api-key-GhIjKl`
export const TEST_BETTER_AUTH_SECRET_ARN = `arn:aws:secretsmanager:${TEST_REGION}:${TEST_ACCOUNT}:secret:monorepo-${TEST_ENV_NAME}-better-auth-secret-MnOpQr`
export const TEST_APP_TOKEN_SECRET_ARN = `arn:aws:secretsmanager:${TEST_REGION}:${TEST_ACCOUNT}:secret:monorepo-${TEST_ENV_NAME}-app-token-secret-StUvWx`

export function buildTestApp(): BuiltApp {
  const app = new App({
    context: {
      [`availability-zones:account=${TEST_ACCOUNT}:region=${TEST_REGION}`]: [
        "eu-central-1a",
        "eu-central-1b",
      ],
      // Workflow-managed secret ARNs — AppStack reads each via
      // node.tryGetContext and feeds Secret.fromSecretCompleteArn. The full
      // ARN (with random 6-char suffix) keeps the task def `valueFrom` and
      // the IAM grantRead policy resource pinned to the same value.
      cloudflareTunnelSecretArn: TEST_CLOUDFLARE_TUNNEL_SECRET_ARN,
      resendApiKeySecretArn: TEST_RESEND_API_KEY_SECRET_ARN,
      betterAuthSecretArn: TEST_BETTER_AUTH_SECRET_ARN,
      appTokenSecretArn: TEST_APP_TOKEN_SECRET_ARN,
    },
  })

  const stackEnv = { account: TEST_ACCOUNT, region: TEST_REGION }

  const network = new NetworkStack(app, `Network-${TEST_ENV_NAME}`, {
    env: stackEnv,
    envName: TEST_ENV_NAME,
  })

  const data = new DataStack(app, `Data-${TEST_ENV_NAME}`, {
    env: stackEnv,
    envName: TEST_ENV_NAME,
    vpc: network.vpc,
    dataSubnets: network.dataSubnets,
    appSecurityGroupId: network.appSecurityGroup.securityGroupId,
  })

  const appStack = new AppStack(app, `App-${TEST_ENV_NAME}`, {
    env: stackEnv,
    envName: TEST_ENV_NAME,
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
    domain: TEST_DOMAIN,
    adminDomain: TEST_ADMIN_DOMAIN,
  })

  const security = new SecurityStack(app, `Security-${TEST_ENV_NAME}`, {
    env: stackEnv,
    envName: TEST_ENV_NAME,
    appStack,
    dataStack: data,
    alertEmail: TEST_ALERT_EMAIL,
  })

  const observability = new ObservabilityStack(
    app,
    `Observability-${TEST_ENV_NAME}`,
    {
      env: stackEnv,
      envName: TEST_ENV_NAME,
      appStack,
      dataStack: data,
      alertEmail: TEST_ALERT_EMAIL,
      killSwitchTopic: security.killSwitchTopic,
    },
  )

  const backup = new BackupStack(app, `Backup-${TEST_ENV_NAME}`, {
    env: stackEnv,
    envName: TEST_ENV_NAME,
    appStack,
    dataStack: data,
    appSecurityGroup: network.appSecurityGroup,
  })

  return {
    app,
    network,
    data,
    appStack,
    security,
    observability,
    backup,
  }
}
