# Module: Baseline Network
#
# - Per-account VPC: 3 AZs, /16 CIDR, public + private + isolated subnets.
# - Transit Gateway in shared-services account, attached from each workload VPC.
# - VPC Flow Logs to Log Archive S3.
# - PrivateLink endpoints: ECR (api + dkr), S3, Secrets Manager, KMS, CloudWatch Logs, STS.
# - NAT Gateway per AZ in prod (cost-optimized: single NAT in non-prod).
# - Security Hub + GuardDuty + Inspector enabled at org level (configured in identity-center module).
#
# Implementation deferred until post-bootstrap. See:
#   docs/plans/AWS-INTEGRATION-PLAN.md (Networking section)
#   docs/runbooks/AWS-BOOTSTRAP.md step 8
