import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

export type NetworkStackProps = StackProps;

/**
 * NetworkStack: VPC, subnets, NAT, PrivateLink endpoints, security groups.
 *
 * Not yet implemented. See docs/runbooks/AWS-BOOTSTRAP.md and
 * docs/plans/AWS-INTEGRATION-PLAN.md (Networking section).
 */
export class NetworkStack extends Stack {
  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    throw new Error(
      "NetworkStack: not yet implemented — see AWS-BOOTSTRAP runbook and AWS-INTEGRATION-PLAN.md (Networking).",
    );
  }
}
