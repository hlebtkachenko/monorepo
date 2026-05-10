# Module: Log Archive (Security OU)
#
# - S3 audit bucket with Object Lock enabled in COMPLIANCE mode.
# - 7-year (2555-day) retention to cover DORA + SOC 2 + financial regulations.
# - MFA Delete enabled (root principal action only).
# - Versioning enabled.
# - Replication to DR region (eu-west-1).
# - Org-wide CloudTrail trail writes here (management events + S3 data events).
# - AWS Config aggregator delivery target.
# - Bucket policy denies non-TLS, denies non-org principals.
#
# Implementation deferred until post-bootstrap. See:
#   docs/plans/AWS-INTEGRATION-PLAN.md (Audit section)
#   docs/runbooks/AWS-BOOTSTRAP.md step 7
