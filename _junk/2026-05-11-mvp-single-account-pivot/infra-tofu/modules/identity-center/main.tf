# Module: IAM Identity Center
#
# - SAML federation to Google Workspace as identity provider.
# - Permission sets:
#     AdministratorAccess (break-glass only, MFA + 1h session)
#     PowerUserAccess
#     ReadOnlyAccess
#     BillingViewer
# - Account assignments per OU (Security, Workloads/*).
# - Prod-touching sets: PT4H session, MFA required.
#
# Implementation deferred until post-bootstrap. See:
#   docs/plans/AWS-INTEGRATION-PLAN.md (Identity section)
#   docs/runbooks/AWS-BOOTSTRAP.md step 6
