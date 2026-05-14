import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import {
  SubnetSelection,
  type ISubnet,
  type IVpc,
  type SecurityGroup,
} from "aws-cdk-lib/aws-ec2"
import {
  Capability,
  Cluster,
  ContainerImage,
  ContainerInsights,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  LinuxParameters,
  LogDriver,
  OperatingSystemFamily,
  Secret as EcsSecret,
} from "aws-cdk-lib/aws-ecs"
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import type { DatabaseInstance } from "aws-cdk-lib/aws-rds"
import type { Bucket } from "aws-cdk-lib/aws-s3"
import { Secret, type ISecret } from "aws-cdk-lib/aws-secretsmanager"
import type { Repository } from "aws-cdk-lib/aws-ecr"
import type { Construct } from "constructs"

export interface AppStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly publicSubnets: ISubnet[]
  readonly appSecurityGroup: SecurityGroup
  readonly database: DatabaseInstance
  readonly databaseSecret: Secret
  readonly appBucket: Bucket
  readonly webRepository: Repository
  readonly apiRepository: Repository
  readonly domain: string
}

/**
 * Cloudflare-Tunnel-fronted ECS Fargate task (ADR 0008).
 *
 * One task per environment, three containers sharing a network namespace:
 *   - web         : Next.js, port 3000
 *   - api         : NestJS, port 3001
 *   - cloudflared : sidecar establishing outbound tunnel to Cloudflare edge
 *
 * Task lives in public subnet with assignPublicIp=true (one public IPv4 per
 * task ~= $3.65/mo). Security group denies all public ingress. cloudflared
 * pulls user traffic in via the tunnel, routes to localhost:3000 or :3001
 * based on path rules configured in Cloudflare's Zero Trust dashboard.
 *
 * Image tag passed via CDK context: `cdk deploy -c imageTag=<git-sha>`.
 * Defaults to "bootstrap" for the first deploy when ECR is still empty.
 *
 * Tunnel token lives in a Secrets Manager secret created by this stack.
 * The deploy workflow writes the actual token value (from the GitHub repo
 * secret) into the AWS secret before each deploy.
 */
export class AppStack extends Stack {
  readonly cluster: Cluster
  readonly service: FargateService
  readonly tunnelTokenSecret: ISecret
  readonly webLogGroup: LogGroup
  readonly apiLogGroup: LogGroup
  readonly tunnelLogGroup: LogGroup

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    const imageTag =
      (this.node.tryGetContext("imageTag") as string | undefined) ?? "bootstrap"

    // Tunnel token secret is created + populated by the deploy workflow before
    // cdk deploy App-* runs (see .github/workflows/_deploy-aws.yml). CDK only
    // references it by name so the secret value lifecycle stays decoupled
    // from stack updates.
    this.tunnelTokenSecret = Secret.fromSecretNameV2(
      this,
      "TunnelTokenSecret",
      `windhoek-${props.envName}-cloudflare-tunnel-token`,
    )

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: `windhoek-${props.envName}`,
      containerInsightsV2: ContainerInsights.ENABLED,
    })

    const publicSubnetSelection: SubnetSelection = {
      subnets: props.publicSubnets,
    }

    const taskExecutionRole = new Role(this, "TaskExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    })
    props.databaseSecret.grantRead(taskExecutionRole)
    this.tunnelTokenSecret.grantRead(taskExecutionRole)

    const taskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime IAM role shared by web + api containers",
    })
    props.appBucket.grantReadWrite(taskRole)
    props.databaseSecret.grantRead(taskRole)

    const taskDef = new FargateTaskDefinition(this, "TaskDef", {
      cpu: 512,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      executionRole: taskExecutionRole,
      taskRole,
    })

    // Shared ephemeral volume mounted at /tmp on every container so apps
    // still have a writable scratch directory after readonlyRootFilesystem
    // is set below. Fargate-managed - storage comes out of the task's
    // built-in 20 GiB ephemeral pool.
    taskDef.addVolume({ name: "tmp" })

    // Drop ALL Linux capabilities. Removes NET_ADMIN/SYS_ADMIN/etc. that
    // most cryptominer payloads need to operate.
    const linuxParams = (id: string) => {
      const params = new LinuxParameters(this, id)
      params.dropCapabilities(Capability.ALL)
      return params
    }

    this.webLogGroup = new LogGroup(this, "WebLogs", {
      logGroupName: `/ecs/windhoek-${props.envName}/web`,
      retention: RetentionDays.ONE_WEEK,
    })
    this.apiLogGroup = new LogGroup(this, "ApiLogs", {
      logGroupName: `/ecs/windhoek-${props.envName}/api`,
      retention: RetentionDays.ONE_WEEK,
    })
    this.tunnelLogGroup = new LogGroup(this, "TunnelLogs", {
      logGroupName: `/ecs/windhoek-${props.envName}/cloudflared`,
      retention: RetentionDays.ONE_WEEK,
    })

    // Next.js standalone server writes to /app/.next/cache, which a readonly
    // rootfs blocks. Until a custom cacheHandler + Dockerfile copy is in
    // place, the web container keeps a writable root. capDrop ALL still
    // blocks crypto-miner payloads. Tmpfs mount is harmless extra capacity.
    const webContainer = taskDef.addContainer("web", {
      containerName: "web",
      image: ContainerImage.fromEcrRepository(props.webRepository, imageTag),
      portMappings: [{ containerPort: 3000 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "web",
        logGroup: this.webLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        PORT: "3000",
        APP_DOMAIN: props.domain,
      },
      memoryReservationMiB: 384,
      linuxParameters: linuxParams("WebLinuxParams"),
    })
    webContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    const apiContainer = taskDef.addContainer("api", {
      containerName: "api",
      image: ContainerImage.fromEcrRepository(props.apiRepository, imageTag),
      portMappings: [{ containerPort: 3001 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "api",
        logGroup: this.apiLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        PORT: "3001",
        HOST: "0.0.0.0",
        DATABASE_HOST: props.database.dbInstanceEndpointAddress,
        DATABASE_PORT: props.database.dbInstanceEndpointPort,
        DATABASE_NAME: "windhoek",
        APP_BUCKET: props.appBucket.bucketName,
        APP_DOMAIN: props.domain,
      },
      secrets: {
        DATABASE_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
        DATABASE_USERNAME: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "username",
        ),
      },
      memoryReservationMiB: 512,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("ApiLinuxParams"),
    })
    apiContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    const tunnelContainer = taskDef.addContainer("cloudflared", {
      containerName: "cloudflared",
      image: ContainerImage.fromRegistry("cloudflare/cloudflared:latest"),
      essential: true,
      command: ["tunnel", "--no-autoupdate", "run"],
      logging: LogDriver.awsLogs({
        streamPrefix: "cloudflared",
        logGroup: this.tunnelLogGroup,
      }),
      secrets: {
        TUNNEL_TOKEN: EcsSecret.fromSecretsManager(this.tunnelTokenSecret),
      },
      memoryReservationMiB: 128,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("TunnelLinuxParams"),
    })
    tunnelContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    this.service = new FargateService(this, "Service", {
      cluster: this.cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: publicSubnetSelection,
      securityGroups: [props.appSecurityGroup],
      enableExecuteCommand: false,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(90),
    })

    new CfnOutput(this, "AppDomain", {
      value: props.domain,
      description:
        "Public hostname configured in Cloudflare Tunnel. Resolves via Cloudflare edge to the tunnel terminating inside this Fargate task.",
    })
    new CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "ECS cluster name for diagnostics",
    })
    new CfnOutput(this, "TunnelTokenSecretArn", {
      value: this.tunnelTokenSecret.secretArn,
      description:
        "Secrets Manager ARN where the deploy workflow writes the Cloudflare Tunnel connector token.",
    })
  }
}
