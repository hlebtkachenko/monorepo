import { App } from "aws-cdk-lib"
import { AppStack } from "../lib/app-stack.js"
import { BackupStack } from "../lib/backup-stack.js"
import { BillingAlarmsStack } from "../lib/billing-alarms-stack.js"
import { DataStack } from "../lib/data-stack.js"
import { NetworkStack } from "../lib/network-stack.js"
import { ObservabilityStack } from "../lib/observability-stack.js"
import { SecurityStack } from "../lib/security-stack.js"

export const TEST_ACCOUNT = "123456789012"
export const TEST_REGION = "eu-central-1"
export const TEST_DOMAIN = "test.example.com"
export const TEST_ALERT_EMAIL = "test@example.com"
export const TEST_ENV_NAME = "test"

interface BuiltApp {
  readonly app: App
  readonly network: NetworkStack
  readonly data: DataStack
  readonly appStack: AppStack
  readonly security: SecurityStack
  readonly observability: ObservabilityStack
  readonly billingAlarms: BillingAlarmsStack
  readonly backup: BackupStack
}

export function buildTestApp(): BuiltApp {
  const app = new App({
    context: {
      [`availability-zones:account=${TEST_ACCOUNT}:region=${TEST_REGION}`]: [
        "eu-central-1a",
        "eu-central-1b",
      ],
      [`availability-zones:account=${TEST_ACCOUNT}:region=us-east-1`]: [
        "us-east-1a",
        "us-east-1b",
      ],
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
    appBucket: data.appBucket,
    webRepository: data.webRepository,
    apiRepository: data.apiRepository,
    domain: TEST_DOMAIN,
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

  const billingAlarms = new BillingAlarmsStack(
    app,
    `BillingAlarms-${TEST_ENV_NAME}`,
    {
      env: { account: TEST_ACCOUNT, region: "us-east-1" },
      envName: TEST_ENV_NAME,
      alertEmail: TEST_ALERT_EMAIL,
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
    billingAlarms,
    backup,
  }
}
