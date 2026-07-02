/**
 * Audit surface data contract for the workspace tier. Entirely MOCK: no
 * audit-service / engagement / report tables back this surface yet. Every array
 * is static and deterministic (no `Math.random` / `Date.now`) so renders never
 * drift and the surface reads as a clear placeholder until real sources land.
 *
 * Audit is a paid add-on: a workspace team orders Afframe's accounting-audit
 * services, chooses which of their companies each service covers,
 * communicates with the Afframe audit team, and collects the delivered reports
 * plus an archive. Icons are drawn ONLY from the ICON_NAMES union.
 */

import type { IconName } from "@workspace/ui/icon-packs"

/** One orderable audit service in the catalog. */
export interface AuditService {
  id: string
  name: string
  description: string
  /** Display price string, e.g. "12 000 Kč / yr". */
  price: string
  /** Leading icon from the ICON_NAMES union. */
  icon: IconName
  /** Highlight as a recommended / most-ordered service. */
  popular?: boolean
}

export type AuditStatus = "Active" | "In review" | "Completed" | "Awaiting docs"

/** One company enrolled in a service for a given period. */
export interface AuditEngagement {
  id: string
  /** Client company name. */
  company: string
  /** Service name (matches an `AuditService.name`). */
  service: string
  status: AuditStatus
  /** Fiscal period, e.g. "2025". */
  period: string
  /** Display price string. */
  price: string
  /** ISO date of the last update (deterministic, no `Date.now`). */
  updated: string
}

/** One message in the thread with the Afframe audit team. */
export interface AuditMessage {
  id: string
  from: "Afframe" | "You"
  /** Author display name. */
  author: string
  body: string
  /** ISO date string (deterministic). */
  date: string
}

export type AuditReportKind = "Report" | "Certificate" | "Working papers"

/** One delivered document — a report, certificate, or working papers. */
export interface AuditReport {
  id: string
  title: string
  company: string
  kind: AuditReportKind
  /** ISO delivery date (deterministic). */
  date: string
  /** Older documents moved to the archive. */
  archived: boolean
}

export interface AuditTab {
  value: string
  label: string
}

export const AUDIT_TABS: AuditTab[] = [
  { value: "services", label: "Services" },
  { value: "engagements", label: "Engagements" },
  { value: "messages", label: "Messages" },
  { value: "reports", label: "Reports" },
]

/** Per-status Badge variant, kept as a lookup so the view stays declarative. */
export const AUDIT_STATUS_META: Record<
  AuditStatus,
  { badgeVariant: "default" | "secondary" | "outline" | "destructive" }
> = {
  Active: { badgeVariant: "default" },
  "In review": { badgeVariant: "secondary" },
  Completed: { badgeVariant: "outline" },
  "Awaiting docs": { badgeVariant: "destructive" },
}

/** Per-kind Badge variant for the reports table. */
export const AUDIT_REPORT_KIND_META: Record<
  AuditReportKind,
  { badgeVariant: "secondary" | "outline" }
> = {
  Report: { badgeVariant: "secondary" },
  Certificate: { badgeVariant: "outline" },
  "Working papers": { badgeVariant: "outline" },
}

/** MOCK service catalog — the paid add-ons delivered by Afframe's audit team. */
export const AUDIT_SERVICES: AuditService[] = [
  {
    id: "svc-statutory-audit",
    name: "Annual statutory audit",
    description:
      "Full statutory audit of the annual financial statements with an independent auditor's opinion, as required under Czech law.",
    price: "48 000 Kč / yr",
    icon: "Award",
    popular: true,
  },
  {
    id: "svc-tax-compliance",
    name: "Tax compliance review",
    description:
      "Year-end review of corporate income tax, VAT, and control-statement filings against the source ledger before submission.",
    price: "18 000 Kč / yr",
    icon: "ReceiptEuro",
    popular: true,
  },
  {
    id: "svc-due-diligence",
    name: "Due diligence report",
    description:
      "Financial due diligence for an acquisition, investment, or bank facility — a structured findings report on the target's books.",
    price: "36 000 Kč / engagement",
    icon: "Search",
  },
  {
    id: "svc-payroll-audit",
    name: "Payroll audit",
    description:
      "Independent check of payroll runs, social and health contributions, and mandatory statutory reporting for the period.",
    price: "12 000 Kč / yr",
    icon: "Users",
  },
  {
    id: "svc-vat-control",
    name: "VAT control review",
    description:
      "Focused review of VAT treatment, reverse-charge handling, and control-statement (kontrolní hlášení) reconciliation.",
    price: "9 000 Kč / yr",
    icon: "Shield",
  },
]

/** MOCK enrolments — companies covered by a service for a period. */
export const AUDIT_ENGAGEMENTS: AuditEngagement[] = [
  {
    id: "eng-01",
    company: "Acme s.r.o.",
    service: "Annual statutory audit",
    status: "In review",
    period: "2025",
    price: "48 000 Kč / yr",
    updated: "2026-06-28T10:15:00.000Z",
  },
  {
    id: "eng-02",
    company: "Novák & Partners a.s.",
    service: "Tax compliance review",
    status: "Active",
    period: "2025",
    price: "18 000 Kč / yr",
    updated: "2026-06-24T14:40:00.000Z",
  },
  {
    id: "eng-03",
    company: "Kovář Holding s.r.o.",
    service: "Due diligence report",
    status: "Awaiting docs",
    period: "2026",
    price: "36 000 Kč / engagement",
    updated: "2026-06-20T08:05:00.000Z",
  },
  {
    id: "eng-04",
    company: "Dvořák Logistics s.r.o.",
    service: "Payroll audit",
    status: "Completed",
    period: "2025",
    price: "12 000 Kč / yr",
    updated: "2026-05-30T16:20:00.000Z",
  },
  {
    id: "eng-05",
    company: "Svoboda Trading s.r.o.",
    service: "VAT control review",
    status: "Active",
    period: "2025",
    price: "9 000 Kč / yr",
    updated: "2026-06-18T11:50:00.000Z",
  },
  {
    id: "eng-06",
    company: "Procházka Retail s.r.o.",
    service: "Annual statutory audit",
    status: "Awaiting docs",
    period: "2025",
    price: "48 000 Kč / yr",
    updated: "2026-06-12T09:30:00.000Z",
  },
]

/** MOCK thread with the Afframe audit team — newest last (chronological). */
export const AUDIT_MESSAGES: AuditMessage[] = [
  {
    id: "aud-msg-01",
    from: "Afframe",
    author: "Petra Marešová · Afframe Audit",
    body: "Welcome. We've opened the 2025 statutory audit for Acme s.r.o. Please upload the signed financial statements and the trial balance so we can begin fieldwork.",
    date: "2026-06-16T09:00:00.000Z",
  },
  {
    id: "aud-msg-02",
    from: "You",
    author: "You",
    body: "Statements and trial balance are attached. The bank confirmations are still pending — expect them by the end of the week.",
    date: "2026-06-18T13:20:00.000Z",
  },
  {
    id: "aud-msg-03",
    from: "Afframe",
    author: "Petra Marešová · Afframe Audit",
    body: "Received, thank you. We've flagged three intercompany balances that need supporting agreements. I've listed them in the working-papers draft.",
    date: "2026-06-22T10:45:00.000Z",
  },
  {
    id: "aud-msg-04",
    from: "You",
    author: "You",
    body: "Agreements uploaded. Could you also cover the VAT control review for Svoboda Trading in the same period?",
    date: "2026-06-25T15:05:00.000Z",
  },
  {
    id: "aud-msg-05",
    from: "Afframe",
    author: "Petra Marešová · Afframe Audit",
    body: "Added — the VAT control review for Svoboda Trading is now active. The Acme audit opinion is on track for delivery in the second week of July.",
    date: "2026-06-28T08:30:00.000Z",
  },
]

/** MOCK delivered documents — reports, certificates, and working papers. */
export const AUDIT_REPORTS: AuditReport[] = [
  {
    id: "rep-01",
    title: "Payroll audit report 2025",
    company: "Dvořák Logistics s.r.o.",
    kind: "Report",
    date: "2026-06-05T00:00:00.000Z",
    archived: false,
  },
  {
    id: "rep-02",
    title: "Tax compliance review 2025",
    company: "Novák & Partners a.s.",
    kind: "Report",
    date: "2026-05-28T00:00:00.000Z",
    archived: false,
  },
  {
    id: "rep-03",
    title: "Working papers — statutory audit 2025",
    company: "Acme s.r.o.",
    kind: "Working papers",
    date: "2026-06-27T00:00:00.000Z",
    archived: false,
  },
  {
    id: "rep-04",
    title: "Independent auditor's certificate 2024",
    company: "Acme s.r.o.",
    kind: "Certificate",
    date: "2025-07-11T00:00:00.000Z",
    archived: true,
  },
  {
    id: "rep-05",
    title: "VAT control review 2024",
    company: "Svoboda Trading s.r.o.",
    kind: "Report",
    date: "2025-06-30T00:00:00.000Z",
    archived: true,
  },
  {
    id: "rep-06",
    title: "Payroll audit report 2024",
    company: "Dvořák Logistics s.r.o.",
    kind: "Report",
    date: "2025-06-14T00:00:00.000Z",
    archived: true,
  },
]

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

/** Formats an ISO date string as e.g. "01 Jul 2026" (deterministic). */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso))
}
