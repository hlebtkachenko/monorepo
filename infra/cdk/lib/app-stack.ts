import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import {
  SubnetSelection,
  type ISubnet,
  type IVpc,
  type SecurityGroup,
} from "aws-cdk-lib/aws-ec2"
import {
  Cluster,
  ContainerInsights,
  ContainerImage,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  LogDriver,
  OperatingSystemFamily,
  Secret as EcsSecret,
} from "aws-cdk-lib/aws-ecs"
import {
  ApplicationListener,
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCondition,
  TargetType,
} from "aws-cdk-lib/aws-elasticloadbalancingv2"
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import { Certificate } from "aws-cdk-lib/aws-certificatemanager"
import type { DatabaseInstance } from "aws-cdk-lib/aws-rds"
import type { Bucket } from "aws-cdk-lib/aws-s3"
import {
  Secret as SecretLookup,
  type Secret,
} from "aws-cdk-lib/aws-secretsmanager"
import type { Repository } from "aws-cdk-lib/aws-ecr"
import type { Construct } from "constructs"

export interface AppStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly appSubnets: ISubnet[]
  readonly publicSubnets: ISubnet[]
  readonly appSecurityGroup: SecurityGroup
  readonly albSecurityGroup: SecurityGroup
  readonly database: DatabaseInstance
  readonly databaseSecret: Secret
  readonly appBucket: Bucket
  readonly webRepository: Repository
  readonly apiRepository: Repository
  readonly domain: string
}

/**
 * ECS Fargate cluster + ALB + two services (web, api). Observability folded
 * into this stack (CloudWatch log groups, no separate ObservabilityStack —
 * advisor: cut the 4th stack).
 *
 * Image tag passed via CDK context: `cdk deploy -c imageTag=<git-sha>`.
 * Defaults to "bootstrap" — a placeholder that fails to start, used only for
 * the initial CDK deploy before the first real image lands in ECR. The deploy
 * workflow always passes the real tag.
 *
 * ACM cert is OPTIONAL via env var ACM_CERT_ARN. When unset, ALB serves HTTP
 * only (acceptable for first-day smoke). Hleb provisions the cert manually in
 * AWS console (DNS validation against afframe.com), then sets the env var on
 * the next deploy to switch to HTTPS.
 */
export class AppStack extends Stack {
  readonly cluster: Cluster
  readonly loadBalancer: ApplicationLoadBalancer
  readonly webService: FargateService
  readonly apiService: FargateService

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    const imageTag =
      (this.node.tryGetContext("imageTag") as string | undefined) ?? "bootstrap"
    const certArn = process.env.ACM_CERT_ARN
    const redisSecretArn = process.env.UPSTASH_REDIS_SECRET_ARN

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: `windhoek-${props.envName}`,
      containerInsightsV2: ContainerInsights.ENABLED,
    })

    const appSubnetSelection: SubnetSelection = { subnets: props.appSubnets }
    const publicSubnetSelection: SubnetSelection = {
      subnets: props.publicSubnets,
    }

    this.loadBalancer = new ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: publicSubnetSelection,
      securityGroup: props.albSecurityGroup,
      loadBalancerName: `windhoek-${props.envName}`,
    })

    const webLogGroup = new LogGroup(this, "WebLogs", {
      logGroupName: `/ecs/windhoek-${props.envName}/web`,
      retention: RetentionDays.ONE_WEEK,
    })
    const apiLogGroup = new LogGroup(this, "ApiLogs", {
      logGroupName: `/ecs/windhoek-${props.envName}/api`,
      retention: RetentionDays.ONE_WEEK,
    })

    const taskExecutionRole = new Role(this, "TaskExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    })
    props.databaseSecret.grantRead(taskExecutionRole)

    const webTaskRole = new Role(this, "WebTaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime IAM role for web Fargate tasks",
    })
    props.appBucket.grantRead(webTaskRole)

    const apiTaskRole = new Role(this, "ApiTaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime IAM role for api Fargate tasks",
    })
    props.appBucket.grantReadWrite(apiTaskRole)
    props.databaseSecret.grantRead(apiTaskRole)

    const webTaskDef = new FargateTaskDefinition(this, "WebTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      executionRole: taskExecutionRole,
      taskRole: webTaskRole,
    })
    webTaskDef.addContainer("web", {
      containerName: "web",
      image: ContainerImage.fromEcrRepository(props.webRepository, imageTag),
      portMappings: [{ containerPort: 3000 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "web",
        logGroup: webLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
      },
    })

    const apiSecrets: Record<string, EcsSecret> = {
      DATABASE_PASSWORD: EcsSecret.fromSecretsManager(
        props.databaseSecret,
        "password",
      ),
      DATABASE_USERNAME: EcsSecret.fromSecretsManager(
        props.databaseSecret,
        "username",
      ),
    }
    if (redisSecretArn) {
      const redisSecret = SecretLookup.fromSecretCompleteArn(
        this,
        "RedisSecret",
        redisSecretArn,
      )
      apiSecrets.REDIS_URL = EcsSecret.fromSecretsManager(redisSecret)
    }

    const apiTaskDef = new FargateTaskDefinition(this, "ApiTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      executionRole: taskExecutionRole,
      taskRole: apiTaskRole,
    })
    apiTaskDef.addContainer("api", {
      containerName: "api",
      image: ContainerImage.fromEcrRepository(props.apiRepository, imageTag),
      portMappings: [{ containerPort: 3001 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "api",
        logGroup: apiLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        DATABASE_HOST: props.database.dbInstanceEndpointAddress,
        DATABASE_PORT: props.database.dbInstanceEndpointPort,
        DATABASE_NAME: "windhoek",
        APP_BUCKET: props.appBucket.bucketName,
      },
      secrets: apiSecrets,
    })

    this.webService = new FargateService(this, "WebService", {
      cluster: this.cluster,
      taskDefinition: webTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: appSubnetSelection,
      securityGroups: [props.appSecurityGroup],
      enableExecuteCommand: false,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
    })

    this.apiService = new FargateService(this, "ApiService", {
      cluster: this.cluster,
      taskDefinition: apiTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: appSubnetSelection,
      securityGroups: [props.appSecurityGroup],
      enableExecuteCommand: false,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
    })

    const webTargetGroup = new ApplicationTargetGroup(this, "WebTg", {
      vpc: props.vpc,
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: "/api/version",
        healthyHttpCodes: "200-299",
        interval: Duration.seconds(15),
        timeout: Duration.seconds(5),
      },
    })
    const apiTargetGroup = new ApplicationTargetGroup(this, "ApiTg", {
      vpc: props.vpc,
      port: 3001,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200-299",
        interval: Duration.seconds(15),
        timeout: Duration.seconds(5),
      },
    })

    this.webService.attachToApplicationTargetGroup(webTargetGroup)
    this.apiService.attachToApplicationTargetGroup(apiTargetGroup)

    let listener: ApplicationListener
    if (certArn) {
      this.loadBalancer.addListener("HttpRedirect", {
        port: 80,
        protocol: ApplicationProtocol.HTTP,
        defaultAction: ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443",
          permanent: true,
        }),
      })
      listener = this.loadBalancer.addListener("Https", {
        port: 443,
        protocol: ApplicationProtocol.HTTPS,
        certificates: [Certificate.fromCertificateArn(this, "Cert", certArn)],
        defaultTargetGroups: [webTargetGroup],
      })
    } else {
      listener = this.loadBalancer.addListener("Http", {
        port: 80,
        protocol: ApplicationProtocol.HTTP,
        defaultTargetGroups: [webTargetGroup],
      })
    }

    listener.addAction("ApiRoute", {
      priority: 10,
      conditions: [ListenerCondition.pathPatterns(["/api/*"])],
      action: ListenerAction.forward([apiTargetGroup]),
    })

    new CfnOutput(this, "AlbDnsName", {
      value: this.loadBalancer.loadBalancerDnsName,
      description:
        "Public DNS name of the ALB. Add CNAME at adm.tools pointing the app domain here.",
    })
    new CfnOutput(this, "AppDomain", {
      value: props.domain,
      description:
        "App domain — must CNAME to AlbDnsName before users can reach via the domain.",
    })
    new CfnOutput(this, "WebEcrUri", {
      value: props.webRepository.repositoryUri,
      description: "Push web image here: docker tag <local> $(WebEcrUri):<tag>",
    })
    new CfnOutput(this, "ApiEcrUri", {
      value: props.apiRepository.repositoryUri,
      description: "Push api image here: docker tag <local> $(ApiEcrUri):<tag>",
    })
  }
}
