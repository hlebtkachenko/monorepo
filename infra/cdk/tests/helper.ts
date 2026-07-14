import { App } from "aws-cdk-lib"
import { AppStack } from "../lib/app-stack.js"
import { BackupStack } from "../lib/backup-stack.js"
import { DataStack } from "../lib/data-stack.js"
import { NetworkStack } from "../lib/network-stack.js"
import { ObservabilityStack } from "../lib/observability-stack.js"
import { SecurityStack } from "../lib/security-stack.js"

export const TEST_ACCOUNT = "123456789012"
export const TEST_REGION = "eu-central-1"
const TEST_DOMAIN = "test.example.com"
// Deliberately NOT a subdomain of TEST_DOMAIN — proves adminDomain is an
// independent value, not derived from the web domain.
const TEST_ADMIN_DOMAIN = "admin-console.example.net"
// Deliberately on neither TEST_DOMAIN nor TEST_ADMIN_DOMAIN — proves the
// mail-from address is plumbed independently (a separate Resend-verified
// domain in real life).
const TEST_MAIL_FROM_ADDRESS = "no-reply@mail.example.org"
const TEST_ENV_NAME = "test"

interface BuiltApp {
  readonly app: App
  readonly network: NetworkStack
  readonly data: DataStack
  readonly appStack: AppStack
  readonly security: SecurityStack
  readonly observability: ObservabilityStack
  readonly backup: BackupStack
}

export function buildTestApp(
  envName: string = TEST_ENV_NAME,
  outdir?: string,
): BuiltApp {
  const app = new App({
    outdir,
    context: {
      [`availability-zones:account=${TEST_ACCOUNT}:region=${TEST_REGION}`]: [
        "eu-central-1a",
        "eu-central-1b",
      ],
    },
  })

  const stackEnv = { account: TEST_ACCOUNT, region: TEST_REGION }

  const network = new NetworkStack(app, `Network-${envName}`, {
    env: stackEnv,
    envName,
  })

  const data = new DataStack(app, `Data-${envName}`, {
    env: stackEnv,
    envName,
    vpc: network.vpc,
    dataSubnets: network.dataSubnets,
    appSecurityGroupId: network.appSecurityGroup.securityGroupId,
    domain: TEST_DOMAIN,
  })

  const appStack = new AppStack(app, `App-${envName}`, {
    env: stackEnv,
    envName,
    vpc: network.vpc,
    publicSubnets: network.publicSubnets,
    appSecurityGroup: network.appSecurityGroup,
    database: data.database,
    databaseSecret: data.databaseSecret,
    appUserSecret: data.appUserSecret,
    appBucket: data.appBucket,
    documentsBucket: data.documentsBucket,
    documentsKey: data.documentsKey,
    webRepository: data.webRepository,
    apiRepository: data.apiRepository,
    adminRepository: data.adminRepository,
    domain: TEST_DOMAIN,
    adminDomain: TEST_ADMIN_DOMAIN,
    mailFromAddress: TEST_MAIL_FROM_ADDRESS,
  })

  const security = new SecurityStack(app, `Security-${envName}`, {
    env: stackEnv,
    envName,
    appStack,
    dataStack: data,
  })

  const observability = new ObservabilityStack(
    app,
    `Observability-${envName}`,
    {
      env: stackEnv,
      envName,
      appStack,
      dataStack: data,
      killSwitchTopic: security.killSwitchTopic,
    },
  )

  const backup = new BackupStack(app, `Backup-${envName}`, {
    env: stackEnv,
    envName,
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
