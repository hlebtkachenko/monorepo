/**
 * Static inventory of the Afframe public-facing hostnames. Seeded from
 * `docs/reference/DOMAINS-AND-EMAIL.md` — that doc is the source of truth. When
 * Cloudflare DNS becomes API-readable from the admin task, this file
 * should be replaced by a live fetch + cache.
 */

type DomainEnv = "production" | "staging" | "shared"
type DomainRole =
  "zone" | "web" | "api" | "admin" | "status" | "monitoring" | "cache"

export interface DomainEntry {
  host: string
  env: DomainEnv
  role: DomainRole
  servedBy: string
  behind: string
  envVar?: string
}

export const DOMAINS: ReadonlyArray<DomainEntry> = [
  {
    host: "afframe.com",
    env: "shared",
    role: "zone",
    servedBy: "Cloudflare DNS",
    behind: "—",
  },
  {
    host: "app.afframe.com",
    env: "production",
    role: "web",
    servedBy: "AWS Fargate · web container",
    behind: "Cloudflare Tunnel",
    envVar: "APP_DOMAIN_PRODUCTION",
  },
  {
    host: "app-staging.afframe.com",
    env: "staging",
    role: "web",
    servedBy: "AWS Fargate · web container",
    behind: "Cloudflare Tunnel",
    envVar: "APP_DOMAIN_STAGING",
  },
  {
    host: "api.afframe.com",
    env: "production",
    role: "api",
    servedBy: "AWS Fargate · api container",
    behind: "Cloudflare Tunnel",
  },
  {
    host: "api-staging.afframe.com",
    env: "staging",
    role: "api",
    servedBy: "AWS Fargate · api container",
    behind: "Cloudflare Tunnel",
  },
  {
    host: "admin.afframe.com",
    env: "production",
    role: "admin",
    servedBy: "AWS Fargate · admin container",
    behind: "Cloudflare Tunnel",
    envVar: "ADMIN_DOMAIN_PRODUCTION",
  },
  {
    host: "admin-staging.afframe.com",
    env: "staging",
    role: "admin",
    servedBy: "AWS Fargate · admin container",
    behind: "Cloudflare Tunnel",
    envVar: "ADMIN_DOMAIN_STAGING",
  },
  {
    host: "status.afframe.com",
    env: "shared",
    role: "status",
    servedBy: "OVH VPS · OpenStatus",
    behind: "Cloudflare proxy",
  },
  {
    host: "monitoring.afframe.com",
    env: "shared",
    role: "monitoring",
    servedBy: "Internal Grafana",
    behind: "Cloudflare Access",
  },
  {
    host: "cache.afframe.com",
    env: "shared",
    role: "cache",
    servedBy: "OVH VPS · Turborepo Remote Cache",
    behind: "Cloudflare proxy",
  },
]
