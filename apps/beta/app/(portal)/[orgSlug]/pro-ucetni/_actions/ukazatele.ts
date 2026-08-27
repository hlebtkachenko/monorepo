"use server"

import { revalidatePath } from "next/cache"

import {
  deleteIndicatorAsOffice,
  upsertIndicatorAsOffice,
} from "@/lib/data/indicators"
import { requireOwner, requireScope } from "@/lib/data/scope"
import { isCheckViolation } from "@/lib/pg-error"

import {
  formCappedText,
  formDate,
  formDecimal,
  formIndicatorKind,
  formString,
  formUuid,
} from "./input"
import type { ProUcetniActionState } from "./state"

/**
 * Pro účetní › Zadávání dat › Ukazatele — the writes behind Přehled's Obrat
 * watch (spec §2.1 item 4, §3.3, migration 0020).
 *
 * ITS OWN FILE rather than two more actions in `zadavani.ts`, for the reason
 * `zadavani-ucty.db.test.ts` gives about its own suite: this table's refusals
 * are its own (a negative obrat, a figure with no date) and its happy path
 * asserts against a table the other actions never touch.
 *
 * BOTH ACTIONS OPEN WITH `requireOwner(await requireScope(orgSlug))` — not
 * because the page did it on the way in, but because a Server Action is a public
 * POST endpoint with a generated name, reachable without ever rendering the page
 * that holds its form or the `pro-ucetni/layout.tsx` gate above it.
 *
 * NO MONEY IS PARSED HERE. The obrat arrives as a string, is checked for SHAPE
 * by `formDecimal` (whose only rewrite is a Czech decimal comma to a dot, which
 * moves no digit) and is handed to the data layer as the same string the office
 * typed — spec §0.2 / §0.7. It matters more here than anywhere else in this app:
 * the figure is compared against two statutory thresholds and the answer decides
 * whether a client is told they have a DPH registration duty.
 */

async function ownerFor(formData: FormData) {
  const orgSlug = formString(formData, "orgSlug")
  return {
    orgSlug,
    owner: requireOwner(await requireScope(orgSlug)),
  }
}

/**
 * Both surfaces this write changes: the editing hub and the client's Přehled,
 * where Obrat watch reads the newest reading.
 */
function revalidateIndicators(orgSlug: string): void {
  revalidatePath(`/${orgSlug}/pro-ucetni/zadavani`)
  revalidatePath(`/${orgSlug}`)
}

const INVALID: ProUcetniActionState = {
  status: "error",
  error: "zadavani.errorInvalidInput",
}

/**
 * The office-internal note's ceiling, matching `optionalText(2000)` on the agent
 * API's `noteInternal` (`lib/agent/schemas.ts`). The column is unbounded `text`;
 * the two doors into it agree on what fits rather than each deciding.
 */
const NOTE_MAX_LENGTH = 2000

/**
 * Run a write, turning a database CHECK refusal into an ordinary error state —
 * the twin of `zadavani.ts`'s own `guarded`, kept here so this module does not
 * cross-import a sibling's private helper.
 *
 * The one CHECK this table has is `organization_indicator_amount_nonnegative`,
 * and `formDecimal` already refuses a negative figure above; this is the floor
 * under it, so a rule enforced ONLY in SQL surfaces as a refusal rather than as
 * a 500 with a constraint name in it.
 */
async function guarded(
  write: () => Promise<ProUcetniActionState>,
): Promise<ProUcetniActionState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "zadavani.errorRejected" }
    }
    throw error
  }
}

/**
 * State a reading, or correct the one already stated for that kind and date.
 *
 * ONE ACTION FOR CREATE AND EDIT, unlike every other section on this page, and
 * that is the table's shape rather than a shortcut: `(organization_id, kind,
 * as_of)` is unique, so "state 30. 6. 2026" and "correct 30. 6. 2026" are the
 * same act with the same key. The office is told which one happened rather than
 * being given a guess.
 */
export async function saveIndicatorAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const kind = formIndicatorKind(formData, "kind")
  if (kind === null) return INVALID

  // Not `allowNegative`: obrat is a sum of taxable supplies. `required`, because
  // an indicator row exists to state a figure — the "office has not told us"
  // state is the ABSENCE of a row, which the card already renders honestly.
  const read = formDecimal(formData, "amount", { required: true })
  // `required` already makes an empty box a refusal, so `null` is unreachable
  // here — it is checked anyway because `FieldResult<string | null>` is the
  // shared shape, and narrowing it is what keeps `amount` a plain string all the
  // way down to Postgres.
  const amount = read.ok ? read.value : null
  if (amount === null) {
    return { status: "error", error: "ukazatele.errorAmountInvalid" }
  }

  // §0.4: every number carries the date it is as of. Never "today". `formDate`
  // checks the CALENDAR, not just the shape — a hand-rolled POST carrying
  // `2026-02-30` would otherwise reach Postgres as a 22008, which is not a CHECK
  // violation and so escapes `guarded()` as a 500.
  const asOf = formDate(formData, "asOf")
  if (asOf === null) {
    return { status: "error", error: "ukazatele.errorAsOfRequired" }
  }

  // Capped at the same 2 000 the agent API's `noteInternal` is capped at: one
  // column, two doors, one ceiling. The column itself is unbounded `text`, so
  // without this the form would be the wider door.
  const noteInternal = formCappedText(formData, "noteInternal", NOTE_MAX_LENGTH)
  if (noteInternal === false) {
    return { status: "error", error: "ukazatele.errorNoteTooLong" }
  }

  return guarded(async () => {
    const { action } = await upsertIndicatorAsOffice(owner, {
      kind,
      amount,
      asOf,
      noteInternal,
    })

    revalidateIndicators(orgSlug)
    return {
      status: "ok",
      message: action === "created" ? "zadavani.okCreated" : "zadavani.okSaved",
    }
  })
}

/**
 * Delete a reading outright.
 *
 * OFFERED because of what the client card does with these rows: it shows the one
 * with the newest `as_of`, so a figure entered as of 2036 instead of 2026 hides
 * every correct reading behind it until it is gone. Correcting the AMOUNT is a
 * re-save; correcting the DATE is a delete plus a re-entry, and a typo has no
 * history worth keeping.
 */
export async function deleteIndicatorAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const { orgSlug, owner } = await ownerFor(formData)

  const indicatorId = formUuid(formData, "indicatorId")
  if (indicatorId === null) return INVALID

  const deleted = await deleteIndicatorAsOffice(owner, indicatorId)
  if (!deleted) {
    return { status: "error", error: "zadavani.errorNotFound" }
  }

  revalidateIndicators(orgSlug)
  return { status: "ok", message: "zadavani.okDeleted" }
}
