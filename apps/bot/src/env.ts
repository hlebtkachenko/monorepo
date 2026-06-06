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
  /** Linear API token for the auto-issue engine (DEV-56). Secret. Optional until that phase. */
  LINEAR_API_TOKEN?: string
  /** Linear team id (DEV) for issueCreate. */
  LINEAR_TEAM_ID?: string
  /** Cloudflare D1 — bot state: dedup fingerprints, agent approvals, heartbeats, snooze. */
  DB: D1Database
}
