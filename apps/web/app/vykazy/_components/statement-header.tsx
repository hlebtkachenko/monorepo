"use client"

// The printed form's identification masthead, rebuilt to the official three-zone
// layout of the ROZVAHA / VÝKAZ ZISKU A ZTRÁTY paper form:
//   LEFT   — legal note ("Minimální závazný výčet informací …").
//   CENTER — heading, rozsah, "ke dni", the currency unit, and the
//            Rok | Měsíc | IČ mini-table.
//   RIGHT  — účetní jednotka identification (firma + sídlo).
// Reads OrgConfig + rozsah from context. Renders on screen AND print.

import { useOrg } from "../_lib/org-context"

interface StatementHeaderProps {
  heading: string
  /** VZZ is always "v plném rozsahu"; rozvaha follows the context rozsah toggle. */
  forcePlny?: boolean
}

export function StatementHeader({
  heading,
  forcePlny = false,
}: StatementHeaderProps) {
  const { org, rozsah } = useOrg()

  const zkraceny = !forcePlny && rozsah === "zkraceny"
  const rozsahLabel = zkraceny ? "ve zkráceném rozsahu" : "v plném rozsahu"
  const jednotka = org.vTisicich ? "( v celých tisících Kč )" : "( v Kč )"

  return (
    <header className="mb-3 text-black">
      <div className="grid grid-cols-3 items-start gap-4">
        {/* LEFT — statutory legal note */}
        <div className="text-[8px] leading-tight text-neutral-500">
          <p>Minimální závazný výčet informací</p>
          <p>podle vyhlášky č. 500/2002 Sb.</p>
        </div>

        {/* CENTER — heading + rozsah + ke dni + currency + Rok/Měsíc/IČ table */}
        <div className="flex flex-col items-center text-center">
          <h1 className="text-lg font-bold tracking-wide uppercase">
            {heading}
          </h1>
          <p className="text-[11px] text-neutral-600">{rozsahLabel}</p>
          <p className="mt-0.5 text-[11px]">
            ke dni{" "}
            {org.keDni ? (
              <span className="font-semibold">{org.keDni}</span>
            ) : (
              <span className="inline-block w-24 border-b border-neutral-400 align-baseline" />
            )}
          </p>
          <p className="text-[11px] text-neutral-600">{jednotka}</p>

          <table className="mt-2 border-collapse text-center text-[11px]">
            <tbody>
              <tr>
                <td className="border border-neutral-500 px-3 py-0.5 font-medium">
                  Rok
                </td>
                <td className="border border-neutral-500 px-3 py-0.5 font-medium">
                  Měsíc
                </td>
                <td className="border border-neutral-500 px-3 py-0.5 font-medium">
                  IČ
                </td>
              </tr>
              <tr>
                <td className="border border-neutral-500 px-3 py-0.5">
                  {org.rok || " "}
                </td>
                <td className="border border-neutral-500 px-3 py-0.5">
                  {org.mesic || " "}
                </td>
                <td className="border border-neutral-500 px-3 py-0.5">
                  {org.ico || " "}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* RIGHT — účetní jednotka identification */}
        <div className="text-[11px] leading-tight">
          <p className="text-[8px] text-neutral-500">
            Obchodní firma nebo jiný název účetní jednotky:
          </p>
          <p className="font-semibold">{org.nazev || " "}</p>
          <p className="mt-1 text-[8px] text-neutral-500">
            Sídlo nebo bydliště účetní jednotky a místo podnikání liší-li se od
            bydliště:
          </p>
          {org.sidlo ? <p>{org.sidlo}</p> : null}
          {org.obec ? <p>{org.obec}</p> : null}
          {org.psc ? <p>{org.psc}</p> : null}
          {org.stat ? <p>{org.stat}</p> : null}
        </div>
      </div>
    </header>
  )
}
