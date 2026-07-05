// Re-export from @workspace/auth/invite-issuer. Kept here as a thin
// stable import path for callers in apps/web; the implementation lives
// in packages/auth so the dev CLI scripts can reuse it.
export {
  issueInvite,
  revokePendingInvites,
} from "@workspace/auth/invite-issuer"
