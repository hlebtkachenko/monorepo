# Module: Service Control Policies
#
# SCPs to attach across the org tree:
#   - DenyNonEURegions      (allow only eu-central-1, eu-west-1; deny all others)
#   - DenyIAMUserCreate     (deny iam:CreateUser, iam:CreateAccessKey — IAM Identity Center only)
#   - DenyRootUserActions   (deny anything from the root principal post-bootstrap)
#   - DenyDisableCloudTrail (deny cloudtrail:Stop*, DeleteTrail, PutEventSelectors)
#   - DenyDisableConfig     (deny config:Stop*, DeleteConfigurationRecorder)
#   - DenyDisableGuardDuty  (deny guardduty:Disassociate*, Delete*)
#   - DenyS3PublicAccess    (deny s3:PutBucketPublicAccessBlock with public values)
#   - DenyKMSDelete         (require deletion windows; deny ScheduleKeyDeletion < 30d)
#
# Implementation deferred until post-bootstrap. See:
#   docs/plans/AWS-INTEGRATION-PLAN.md (Guardrails section)
#   docs/runbooks/AWS-BOOTSTRAP.md step 5
