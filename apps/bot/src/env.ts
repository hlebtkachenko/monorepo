export interface Env {
  ENVIRONMENT?: string
  /** Telegram bot token (@BotFather). Secret. */
  BOT_TOKEN: string
  /** The only Telegram user id allowed to drive the bot + the send target. */
  TELEGRAM_USER_ID: string
  /** Verifies the X-Telegram-Bot-Api-Secret-Token header on inbound webhooks. Secret. */
  WEBHOOK_SECRET: string
  /** Shared secret for outbound senders hitting POST /ingest. Secret. */
  INGEST_SECRET: string
  /** Optional api base for /status reads (later phases). */
  API_URL?: string
  /** GitHub token for issue create/comment + ProjectV2 writes. Secret. */
  GITHUB_ISSUES_TOKEN?: string
  /** Optional GitHub ProjectV2 id for auto-created tracked issues. */
  GITHUB_PROJECT_ID?: string
  /** Optional ProjectV2 field config JSON. Omit to create plain issues without Project writes. */
  GITHUB_PROJECT_FIELD_CONFIG?: string
  /** Optional parent Epic issue number for auto-created tracked issues. */
  GITHUB_EPIC_ISSUE_NUMBER?: string
  /**
   * Fine-scoped GitHub PAT for the control plane: workflow_dispatch (write commands),
   * rerun-failed-jobs (CI rerun button), and read queries (runs / PRs / job logs).
   * Needs `actions:write` + `contents:read` on the repo. Secret. Optional until PR-2.
   * May also be used as the issue token when it has `issues:write` + project access.
   */
  GITHUB_DISPATCH_TOKEN?: string
  /** owner/repo for the GitHub API. Set by deploy-bot from github.repository. */
  GITHUB_REPO?: string
  /** Cloudflare D1 — bot state: dedup fingerprints, agent approvals, heartbeats, snooze. */
  DB: D1Database
}
