import { Stack, type StackProps } from "aws-cdk-lib"
import {
  GatewayVpcEndpointAwsService,
  IpAddresses,
  InterfaceVpcEndpointAwsService,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
  type ISubnet,
} from "aws-cdk-lib/aws-ec2"
import type { Construct } from "constructs"

export interface NetworkStackProps extends StackProps {
  readonly envName: string
}

/**
 * VPC with 2 AZs and 3 subnet tiers (public, private-app, private-data).
 * Single NAT-GW in the first AZ to keep MVP cost down (advisor guidance).
 * S3 gateway endpoint (free). Three interface endpoints (ECR-API, ECR-DKR,
 * CloudWatch Logs) in private-app subnets only — kills NAT data charges
 * on image pulls and log writes. Trip-wire to add more endpoints: NAT data
 * processing > $5/mo.
 */
export class NetworkStack extends Stack {
  readonly vpc: Vpc
  readonly publicSubnets: ISubnet[]
  readonly appSubnets: ISubnet[]
  readonly dataSubnets: ISubnet[]
  readonly appSecurityGroup: SecurityGroup
  readonly albSecurityGroup: SecurityGroup

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props)

    this.vpc = new Vpc(this, "Vpc", {
      ipAddresses: IpAddresses.cidr("10.42.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "app",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "data",
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    })

    this.publicSubnets = this.vpc.publicSubnets
    this.appSubnets = this.vpc.selectSubnets({
      subnetGroupName: "app",
    }).subnets
    this.dataSubnets = this.vpc.selectSubnets({
      subnetGroupName: "data",
    }).subnets

    this.appSecurityGroup = new SecurityGroup(this, "AppSg", {
      vpc: this.vpc,
      description: "ECS task security group for web + api services",
      allowAllOutbound: true,
    })

    this.albSecurityGroup = new SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      description: "ALB public-facing security group",
      allowAllOutbound: true,
    })
    this.albSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(80),
      "HTTP from internet",
    )
    this.albSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      "HTTPS from internet",
    )

    this.appSecurityGroup.addIngressRule(
      Peer.securityGroupId(this.albSecurityGroup.securityGroupId),
      Port.tcpRange(3000, 3001),
      "Allow ALB to reach Fargate task ports",
    )

    this.vpc.addGatewayEndpoint("S3Endpoint", {
      service: GatewayVpcEndpointAwsService.S3,
    })

    const interfaceEndpoints: Array<{
      id: string
      service: InterfaceVpcEndpointAwsService
    }> = [
      { id: "EcrApi", service: InterfaceVpcEndpointAwsService.ECR },
      { id: "EcrDkr", service: InterfaceVpcEndpointAwsService.ECR_DOCKER },
      {
        id: "CwLogs",
        service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      },
    ]

    for (const ep of interfaceEndpoints) {
      this.vpc.addInterfaceEndpoint(ep.id, {
        service: ep.service,
        subnets: { subnets: this.appSubnets.slice(0, 1) },
        privateDnsEnabled: true,
      })
    }

    this.appSecurityGroup.addIngressRule(
      Peer.ipv4(this.vpc.vpcCidrBlock),
      Port.tcp(443),
      "Allow VPC endpoints from any subnet in the VPC",
    )
  }
}
