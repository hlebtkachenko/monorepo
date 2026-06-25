/**
 * Drizzle pgEnum declarations — single source of truth.
 *
 * Every enum declaration here MUST mirror the SQL exactly. If a future
 * migration adds a value via `ALTER TYPE ... ADD VALUE`, the same PR MUST
 * update this file.
 *
 * Comments point to the migration that creates each SQL enum.
 */
import { pgEnum } from "drizzle-orm/pg-core"

// Mirrors: packages/db/migrations/0004_audit.sql — CREATE TYPE actor_kind AS ENUM
export const actorKind = pgEnum("actor_kind", [
  "human",
  "ai",
  "ai_on_behalf",
  "system",
])

// Mirrors: packages/db/migrations/0005_workspace.sql — CREATE TYPE workspace_role AS ENUM
export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
])

// Mirrors: packages/db/migrations/0005_workspace.sql — CREATE TYPE organization_role AS ENUM
export const organizationRole = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
  "agent",
  "guest",
])

// Mirrors: packages/db/migrations/0002_auth.sql — CREATE TYPE invite_status AS ENUM
export const inviteStatus = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE app_user_experience AS ENUM
export const appUserExperience = pgEnum("app_user_experience", [
  "new",
  "some",
  "bookkeeper",
  "accountant",
])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE workspace_use_case AS ENUM
export const workspaceUseCase = pgEnum("workspace_use_case", ["firm", "biz"])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE workspace_team_size AS ENUM
export const workspaceTeamSize = pgEnum("workspace_team_size", [
  "solo",
  "sm",
  "md",
  "lg",
  "xl",
])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE billing_plan AS ENUM
export const billingPlan = pgEnum("billing_plan", [
  "starter",
  "growth",
  "scale",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE accounting_regime AS ENUM
export const accountingRegime = pgEnum("accounting_regime", [
  "PODVOJNE",
  "JEDNODUCHE",
  "DANOVA_EVIDENCE",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE ucetni_obdobi_typ AS ENUM
export const ucetniObdobiTyp = pgEnum("ucetni_obdobi_typ", [
  "kalendar",
  "hospodarsky",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE ucetni_obdobi_stav AS ENUM
export const ucetniObdobiStav = pgEnum("ucetni_obdobi_stav", [
  "otevreno",
  "uzavreno",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE ucetni_doklad_typ AS ENUM
export const ucetniDokladTyp = pgEnum("ucetni_doklad_typ", [
  "FP",
  "FV",
  "BV",
  "ID",
  "pokladni",
  "sberny",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE dilci_druh AS ENUM
export const dilciDruh = pgEnum("dilci_druh", ["zaklad", "dph", "zaokr"])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE ucetni_zapis_druh AS ENUM
export const ucetniZapisDruh = pgEnum("ucetni_zapis_druh", [
  "jednoduchy",
  "slozeny",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE ucetni_zapis_oprava_typ AS ENUM
export const ucetniZapisOpravaTyp = pgEnum("ucetni_zapis_oprava_typ", [
  "storno",
  "doplnkovy",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE zapis_strana AS ENUM
export const zapisStrana = pgEnum("zapis_strana", ["MD", "D"])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE ucet_typ AS ENUM
export const ucetTyp = pgEnum("ucet_typ", ["A", "P", "N", "V", "podrozvahovy"])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE penezni_denik_misto AS ENUM
export const penezniDenikMisto = pgEnum("penezni_denik_misto", [
  "hotovost",
  "banka",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE penezni_denik_smer AS ENUM
export const penezniDenikSmer = pgEnum("penezni_denik_smer", [
  "prijem",
  "vydaj",
])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE vystup_typ AS ENUM
export const vystupTyp = pgEnum("vystup_typ", ["ZAVERKA", "PREHLEDY", "DPFO"])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE podpis_typ AS ENUM
export const podpisTyp = pgEnum("podpis_typ", ["za_pripad", "za_zauctovani"])

// Mirrors: packages/db/migrations/0024_accounting_enums_core.sql — CREATE TYPE kategorie_typ AS ENUM
export const kategorieTyp = pgEnum("kategorie_typ", ["prijem", "vydaj"])
