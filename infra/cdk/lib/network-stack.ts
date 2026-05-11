import { Stack, type StackProps } from "aws-cdk-lib"
import {
  IpAddresses,
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
 * Cloudflare-Tunnel-fronted single-task topology (ADR 0008).
 *
 * VPC with 2 AZs and only 2 subnet tiers:
 *   - public  : Fargate task lives here with a public IP. Outbound to
 *               Cloudflare edge + ECR same-region + Resend/SES goes through
 *               the Internet Gateway. No NAT-GW (saves ~$32/mo).
 *   - isolated: RDS lives here, no internet at all.
 *
 * No interface endpoints (saves ~$22/mo). Task reaches AWS APIs over the
 * public internet because it has its own public IP; same-region traffic to
 * ECR/S3/Secrets Manager stays inside AWS at zero data-transfer cost.
 *
 * appSecurityGroup denies all public ingress; cloudflared in the task
 * establishes an outbound tunnel and pulls user traffic in via that.
 */
export class NetworkStack extends Stack {
  readonly vpc: Vpc
  readonly publicSubnets: ISubnet[]
  readonly dataSubnets: ISubnet[]
  readonly appSecurityGroup: SecurityGroup

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props)

    this.vpc = new Vpc(this, "Vpc", {
      ipAddresses: IpAddresses.cidr("10.42.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        {
          name: "data",
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    })

    this.publicSubnets = this.vpc.publicSubnets
    this.dataSubnets = this.vpc.selectSubnets({
      subnetGroupName: "data",
    }).subnets

    this.appSecurityGroup = new SecurityGroup(this, "AppSg", {
      vpc: this.vpc,
      description:
        "Fargate task security group. Deny all inbound; outbound only via cloudflared tunnel.",
      allowAllOutbound: true,
    })
  }
}
