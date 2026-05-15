// Re-export from @workspace/auth/invite-issuer. Kept here as a thin
// stable import path for callers in apps/web; the implementation lives
// in packages/auth so the dev CLI scripts can reuse it.
export {
  issueInvite,
  revokePendingInvites,
  findOrganizationOwner,
  readInviteByRawToken,
  DEFAULT_INVITE_TTL_SECONDS,
  type IssueInviteInput,
  type IssueInviteResult,
} from "@workspace/auth/invite-issuer"
