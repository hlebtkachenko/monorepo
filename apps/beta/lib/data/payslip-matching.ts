/**
 * Filename → employee matching for Mzdy › Výplatnice's bulk upload (spec
 * §2.6: "office bulk ZIP upload with filename→employee matching preview").
 *
 * A PURE MODULE, DELIBERATELY. The ZIP itself is parsed IN THE BROWSER
 * (`payslip-bulk-upload-form.tsx`) — a payslip archive is tens of individual
 * PDFs, and buffering the whole thing server-side just to propose a match
 * would cost a request round trip for something that needs neither a database
 * nor a server. This file has no `server-only`, no I/O and no schema import,
 * so it is safe in a Client Component's bundle (the same rule
 * `document-filters.ts`'s header states) AND unit-testable without a
 * database — the property most worth having for a heuristic that will get
 * real filenames thrown at it.
 *
 * A PROPOSAL, NEVER A DECISION. This function only PROPOSES a match; the
 * office confirms or reassigns every row in the preview table before a byte
 * is uploaded, and `uploadPayslipDocument` (`payslips.ts`) re-validates the
 * chosen employee id against the organization regardless of what this
 * function guessed. A wrong guess here costs one click to correct; it can
 * never attach a payslip to the wrong person on its own.
 */

/** The one field the matcher reads off an employee register row. */
export type PayslipMatchCandidate = {
  readonly id: string
  readonly fullName: string
}

/**
 * `"high"` — every name token in the employee's full name appears in the
 * filename. `"low"` — only some of them do (a surname alone, most often).
 * Never a third value: a filename matching two employees equally well is not
 * a low-confidence match, it is NO match (see `matchPayslipFilename`) —
 * confidence describes how much of ONE candidate's name was found, not how
 * sure the function is that candidate is the only one who could fit.
 */
export type PayslipMatchConfidence = "high" | "low"

export type PayslipMatch = {
  readonly employeeId: string
  readonly confidence: PayslipMatchConfidence
}

/** Combining diacritical marks — what NFD splits `á` into `a` + this. */
const COMBINING_MARKS = /[̀-ͯ]/g

/** Anything that is not an ASCII letter or digit, after the fold below. */
const NON_WORD = /[^a-z0-9]+/g

/**
 * A name or filename, folded to lowercase ASCII word tokens.
 *
 * NFD + strip-combining-marks turns `Nováková` into `Novakova` — office
 * payroll exports routinely drop diacritics from filenames (`Novakova_07.pdf`
 * for `Nováková`), so matching on the accented form would refuse the exact
 * case this feature exists for. Splitting on every non-alphanumeric run
 * (`_`, `-`, `.`, space) means `07-2026` becomes two numeric tokens rather
 * than one, which does no harm: no employee's name is ever a number, so those
 * tokens simply never match anything.
 */
function normalizeTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .split(NON_WORD)
    .filter((token) => token.length > 0)
}

/** `payslip_novakova_07_2026.pdf` → `payslip_novakova_07_2026`. */
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".")
  return dot > 0 ? filename.slice(0, dot) : filename
}

/**
 * Propose which employee a payslip's filename belongs to, or `null` when the
 * filename names nobody — or names two employees equally well.
 *
 * THE BEST SCORE MUST BE UNIQUE. `employees` is a live register: two people
 * can share a surname, and a filename that matches both by their surname
 * alone must not silently pick the first one in the list — that is exactly
 * the "wrong person's salary" failure mode `lib/data/payroll.ts`'s own header
 * names as the worst outcome this module can produce. A tie at the best score
 * returns `null`, same as no match at all: the preview row renders unassigned
 * and the office picks.
 */
export function matchPayslipFilename(
  filename: string,
  employees: readonly PayslipMatchCandidate[],
): PayslipMatch | null {
  const fileTokens = new Set(normalizeTokens(stripExtension(filename)))
  if (fileTokens.size === 0) return null

  let best: { employeeId: string; matched: number; total: number } | null = null
  let tied = false

  for (const employee of employees) {
    const nameTokens = normalizeTokens(employee.fullName)
    if (nameTokens.length === 0) continue

    const matched = nameTokens.filter((token) => fileTokens.has(token)).length
    if (matched === 0) continue

    if (best === null || matched > best.matched) {
      best = { employeeId: employee.id, matched, total: nameTokens.length }
      tied = false
    } else if (matched === best.matched) {
      tied = true
    }
  }

  if (best === null || tied) return null
  return {
    employeeId: best.employeeId,
    confidence: best.matched === best.total ? "high" : "low",
  }
}
