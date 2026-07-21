"use client"

// Identification footer of the printed ROZVAHA / VÝKAZ ZISKU A ZTRÁTY form: the
// bordered 3-column × 2-row grid that sits at the bottom of the last page
// (právní forma, předmět podnikání, sestaveno / schváleno dne, podpisový
// záznam). Every identity value comes from OrgConfig via context — nothing is
// hardcoded. Renders on screen AND print; the .vykaz-footer print rule keeps it
// unsplit and pins it to the bottom of the last page.

import { useOrg } from "../_lib/org-context"

/** One value/label cell: the value on top (blank underline if empty), muted
 *  label beneath — matching the paper form's field boxes. */
function FieldCell({ value, label }: { value: string; label: string }) {
  return (
    <td className="w-1/3 border border-neutral-500 px-2 py-1 align-top">
      <div className="min-h-[1.2em] font-medium text-black">
        {value ? (
          value
        ) : (
          <span className="block border-b border-neutral-400">&nbsp;</span>
        )}
      </div>
      <div className="mt-1 text-neutral-500">{label}</div>
    </td>
  )
}

export function StatementFooter() {
  const { org } = useOrg()

  return (
    <div className="vykaz-footer mt-6 text-[11px] text-black print:text-[9pt]">
      <table className="w-full table-fixed border-collapse border border-neutral-500">
        <tbody>
          <tr>
            <FieldCell
              value={org.pravniForma}
              label="Právní forma účetní jednotky:"
            />
            <FieldCell
              value={org.predmetPodnikani}
              label="Předmět podnikání:"
            />
            <td className="w-1/3 border border-neutral-500 px-2 py-1 align-top text-neutral-500">
              Pozn.:
            </td>
          </tr>
          <tr>
            <FieldCell value={org.sestavenoDne} label="Sestaveno dne:" />
            <FieldCell
              value={org.schvalenoDne}
              label="Schváleno valnou hromadou dne:"
            />
            <td className="w-1/3 border border-neutral-500 px-2 py-1 align-top text-neutral-500">
              Podpisový záznam statutárního orgánu účetní jednotky nebo
              podpisový záznam fyzické osoby, která je účetní jednotkou
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
