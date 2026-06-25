/**
 * Accounting test fixtures. Reuses @workspace/db's canonical fixtures
 * (adminClient, seedTwoOrganizations, truncateAll — the latter now clears the
 * accounting tables) and adds unit/chart/category seeds built from the public
 * domain API, so tests exercise the same code paths as real callers.
 */

import { withOrganization } from "@workspace/db"
import postgres from "postgres"
import {
  createAccount,
  createCategory,
  createChart,
  createCounterparty,
  createPeriod,
  createUnit,
} from "../src/index"
import type { Regime, UcetTyp } from "../src/index"

/** Minimal KB-grounded chart of accounts for the demo/tests. */
const DEMO_COA: ReadonlyArray<{
  cislo: string
  trida: number
  typ: UcetTyp
}> = [
  { cislo: "211", trida: 2, typ: "A" }, // Pokladna
  { cislo: "221", trida: 2, typ: "A" }, // Bankovní účty
  { cislo: "311", trida: 3, typ: "A" }, // Pohledávky (odběratelé)
  { cislo: "321", trida: 3, typ: "P" }, // Závazky (dodavatelé)
  { cislo: "343", trida: 3, typ: "A" }, // DPH
  { cislo: "501", trida: 5, typ: "N" }, // Spotřeba materiálu
  { cislo: "504", trida: 5, typ: "N" }, // Prodané zboží
  { cislo: "518", trida: 5, typ: "N" }, // Ostatní služby
  { cislo: "601", trida: 6, typ: "V" }, // Tržby za výrobky
  { cislo: "602", trida: 6, typ: "V" }, // Tržby za služby
  { cislo: "604", trida: 6, typ: "V" }, // Tržby za zboží
  { cislo: "701", trida: 7, typ: "P" }, // Počáteční účet rozvažný
  { cislo: "702", trida: 7, typ: "P" }, // Konečný účet rozvažný
  { cislo: "710", trida: 7, typ: "V" }, // Účet zisků a ztrát
]

export interface DoubleEntrySeed {
  jednotkaId: string
  obdobiId: string
  rozvrhId: string
  protistranaId: string
  /** cislo -> ucet id */
  accounts: Record<string, string>
}

/** Seed a PODVOJNE unit with an open period, the demo chart, and a counterparty. */
export async function seedDoubleEntryUnit(
  organizationId: string,
  userId: string,
): Promise<DoubleEntrySeed> {
  return withOrganization(organizationId, userId, async (db) => {
    const jednotkaId = await createUnit(db, {
      organizationId,
      regime: "PODVOJNE",
      nazev: "Demo s.r.o.",
      ico: "12345678",
      platceDph: true,
    })
    const obdobiId = await createPeriod(db, {
      organizationId,
      jednotkaId,
      typ: "kalendar",
      od: "2026-01-01",
      do: "2026-12-31",
    })
    const rozvrhId = await createChart(db, {
      organizationId,
      jednotkaId,
      rok: 2026,
    })
    const accounts: Record<string, string> = {}
    for (const a of DEMO_COA) {
      accounts[a.cislo] = await createAccount(db, {
        organizationId,
        rozvrhId,
        cislo: a.cislo,
        trida: a.trida,
        typ: a.typ,
      })
    }
    const protistranaId = await createCounterparty(db, {
      organizationId,
      nazev: "ACME a.s.",
    })
    return { jednotkaId, obdobiId, rozvrhId, protistranaId, accounts }
  })
}

export interface CashUnitSeed {
  jednotkaId: string
  obdobiId: string
  /** key -> kategorie id */
  categories: Record<string, string>
}

/** Seed a JEDNODUCHE or DANOVA_EVIDENCE unit with an open period + a few categories. */
export async function seedCashUnit(
  organizationId: string,
  userId: string,
  regime: Extract<Regime, "JEDNODUCHE" | "DANOVA_EVIDENCE">,
): Promise<CashUnitSeed> {
  return withOrganization(organizationId, userId, async (db) => {
    const jednotkaId = await createUnit(db, {
      organizationId,
      regime,
      nazev: regime === "JEDNODUCHE" ? "Spolek z.s." : "OSVČ Novák",
      platceDph: false,
    })
    const obdobiId = await createPeriod(db, {
      organizationId,
      jednotkaId,
      typ: "kalendar",
      od: "2026-01-01",
      do: "2026-12-31",
    })
    const categories: Record<string, string> = {
      sluzby: await createCategory(db, {
        organizationId,
        typ: "prijem",
        nazev: "Tržby za služby",
      }),
      material: await createCategory(db, {
        organizationId,
        typ: "vydaj",
        nazev: "Materiál",
      }),
      rezie: await createCategory(db, {
        organizationId,
        typ: "vydaj",
        nazev: "Provozní režie",
      }),
    }
    return { jednotkaId, obdobiId, categories }
  })
}

/** Seed an additional organization under an existing workspace (admin, bypasses RLS). */
export async function seedOrg(
  adminSql: postgres.Sql,
  workspaceId: string,
  slug: string,
  personKind: "legal_entity" | "natural_person" = "legal_entity",
): Promise<string> {
  const subjectKind = personKind === "legal_entity" ? "for_profit" : null
  const [org] = await adminSql<Array<{ id: string }>>`
    INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
    VALUES (uuidv7(), ${workspaceId}::uuid, ${slug}, ${slug}, ${personKind}, ${subjectKind})
    RETURNING id`
  if (!org) throw new Error("seedOrg: insert failed")
  return org.id
}
