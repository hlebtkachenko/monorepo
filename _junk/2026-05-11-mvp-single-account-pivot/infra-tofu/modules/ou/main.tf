# Module: AWS Organizations OU structure
#
# Defines the org tree:
#   - Security        (Log Archive, Audit accounts)
#   - Infrastructure  (shared services: ECR, networking)
#   - Workloads/Prod  (production accounts)
#   - Workloads/Non-Prod (staging, dev accounts)
#   - Sandbox         (experimentation, auto-cleanup)
#   - Suspended       (revoked, retained for audit)
#
# Implementation deferred until post-bootstrap. See:
#   docs/plans/AWS-INTEGRATION-PLAN.md (Org section)
#   docs/runbooks/AWS-BOOTSTRAP.md step 4
