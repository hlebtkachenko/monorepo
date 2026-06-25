/**
 * Master-data setup: accounting unit, period, chart of accounts, accounts,
 * and the external-lookup stubs (counterparty / category / asset). These are
 * thin inserts used by seeding, the demo, and tests. All run through an
 * organization-bound transaction (RLS applies).
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import type { Decimal, KategorieTyp, ObdobiTyp, Regime, UcetTyp } from "./types"

export async function createUnit(
  db: RowExecutor,
  input: {
    organizationId: string
    regime: Regime
    nazev: string
    ico?: string | null
    platceDph: boolean
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO ucetni_jednotka (organization_id, regime, nazev, ico, platce_dph)
        VALUES (${input.organizationId}::uuid, ${input.regime}, ${input.nazev}, ${input.ico ?? null}, ${input.platceDph})
        RETURNING id`,
  )
  return r.id
}

export async function createPeriod(
  db: RowExecutor,
  input: {
    organizationId: string
    jednotkaId: string
    typ: ObdobiTyp
    od: string
    do: string
    stav?: "otevreno" | "uzavreno"
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO ucetni_obdobi (organization_id, jednotka_id, typ, od, "do", stav)
        VALUES (${input.organizationId}::uuid, ${input.jednotkaId}::uuid, ${input.typ}, ${input.od}::date, ${input.do}::date, ${input.stav ?? "otevreno"})
        RETURNING id`,
  )
  return r.id
}

export async function createChart(
  db: RowExecutor,
  input: { organizationId: string; jednotkaId: string; rok: number },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO uctovy_rozvrh (organization_id, jednotka_id, rok)
        VALUES (${input.organizationId}::uuid, ${input.jednotkaId}::uuid, ${input.rok})
        RETURNING id`,
  )
  return r.id
}

export async function createAccount(
  db: RowExecutor,
  input: {
    organizationId: string
    rozvrhId: string
    cislo: string
    trida: number
    typ: UcetTyp
    parentId?: string | null
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO ucet (organization_id, rozvrh_id, cislo, trida, typ, parent_id)
        VALUES (${input.organizationId}::uuid, ${input.rozvrhId}::uuid, ${input.cislo}, ${input.trida}, ${input.typ}, ${input.parentId ?? null})
        RETURNING id`,
  )
  return r.id
}

export async function createCounterparty(
  db: RowExecutor,
  input: { organizationId: string; nazev?: string | null },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO protistrana (organization_id, nazev)
        VALUES (${input.organizationId}::uuid, ${input.nazev ?? null}) RETURNING id`,
  )
  return r.id
}

export async function createCategory(
  db: RowExecutor,
  input: { organizationId: string; typ: KategorieTyp; nazev: string },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO kategorie (organization_id, typ, nazev)
        VALUES (${input.organizationId}::uuid, ${input.typ}, ${input.nazev}) RETURNING id`,
  )
  return r.id
}

export async function createAsset(
  db: RowExecutor,
  input: { organizationId: string; nazev?: string | null },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO majetek (organization_id, nazev)
        VALUES (${input.organizationId}::uuid, ${input.nazev ?? null}) RETURNING id`,
  )
  return r.id
}

export async function createDepreciationPlan(
  db: RowExecutor,
  input: {
    organizationId: string
    jednotkaId: string
    majetekId: string
    metoda: string
    mesicniCastka: Decimal
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO odpisovy_plan (organization_id, jednotka_id, majetek_id, metoda, mesicni_castka)
        VALUES (${input.organizationId}::uuid, ${input.jednotkaId}::uuid, ${input.majetekId}::uuid, ${input.metoda}, ${input.mesicniCastka})
        RETURNING id`,
  )
  return r.id
}

export async function createInventory(
  db: RowExecutor,
  input: { organizationId: string; jednotkaId: string; datum: string },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO inventurni_soupis (organization_id, jednotka_id, datum)
        VALUES (${input.organizationId}::uuid, ${input.jednotkaId}::uuid, ${input.datum}::date)
        RETURNING id`,
  )
  return r.id
}

/** Record a responsible-person signature on a doklad or zapis (§33a/4, exactly one target). */
export async function recordSignature(
  db: RowExecutor,
  input: {
    organizationId: string
    dokladId?: string | null
    zapisId?: string | null
    typ: "za_pripad" | "za_zauctovani"
    podepsal: string
    okamzik?: string
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO podpis (organization_id, doklad_id, zapis_id, typ, podepsal, okamzik)
        VALUES (${input.organizationId}::uuid, ${input.dokladId ?? null}, ${input.zapisId ?? null}, ${input.typ}, ${input.podepsal}::uuid, COALESCE(${input.okamzik ?? null}::timestamptz, now()))
        RETURNING id`,
  )
  return r.id
}
