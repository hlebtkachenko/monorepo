// Obratová předvaha (trial balance) built from parsed deník rows. Pure: rows in,
// per-account MD/DAL turnovers + konečný stav out. No React, no I/O.
//
// Double entry means every row books one MD account and one DAL account for the
// same castka, so Σ MD == Σ DAL by construction. KS (konečný stav) per account =
// Σ MD − Σ DAL on that account.

import type { DenikRow } from "./denik"

export interface UcetBalance {
  ucet: string
  synteticky: string
  obratMD: number
  obratDal: number
  ks: number
}

export interface Predvaha {
  ucty: UcetBalance[]
  sumMD: number
  sumDal: number
  balanced: boolean
  byZdroj: Record<string, number>
}

interface Turnover {
  obratMD: number
  obratDal: number
}

export function buildPredvaha(rows: DenikRow[]): Predvaha {
  const turnover = new Map<string, Turnover>()
  const byZdroj: Record<string, number> = {}
  let sumMD = 0
  let sumDal = 0

  const bump = (ucet: string): Turnover => {
    let entry = turnover.get(ucet)
    if (!entry) {
      entry = { obratMD: 0, obratDal: 0 }
      turnover.set(ucet, entry)
    }
    return entry
  }

  for (const row of rows) {
    const md = row.md.trim()
    const dal = row.dal.trim()
    const { castka } = row

    if (md) {
      bump(md).obratMD += castka
      sumMD += castka
    }
    if (dal) {
      bump(dal).obratDal += castka
      sumDal += castka
    }

    const zdroj = row.zdroj.trim() || "(bez zdroje)"
    byZdroj[zdroj] = (byZdroj[zdroj] ?? 0) + castka
  }

  const ucty: UcetBalance[] = [...turnover.entries()]
    .map(([ucet, t]) => ({
      ucet,
      synteticky: ucet.slice(0, 3),
      obratMD: t.obratMD,
      obratDal: t.obratDal,
      ks: t.obratMD - t.obratDal,
    }))
    .sort((a, b) => a.ucet.localeCompare(b.ucet, "cs"))

  return {
    ucty,
    sumMD,
    sumDal,
    balanced: Math.abs(sumMD - sumDal) < 0.01,
    byZdroj,
  }
}
