"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useBetaTranslations } from "@/i18n/translations"

import { acceptAresAction, lookupAresAction } from "../_actions/company"
import {
  NASTAVENI_ACTION_IDLE,
  type NastaveniActionState,
} from "../_actions/state"

import { IDENTITY_FIELD_LABEL } from "./labels"

/**
 * "Načíst z ARES" — the §2.10 suggest-then-accept surface, owner only.
 *
 * ONE FORM, ONE ACTION STATE, THREE SUBMIT BUTTONS. The buttons carry
 * `intent=lookup | accept | acceptAll`, and `dispatch` routes each to its
 * server action; the answer of every one of them lands in the SAME state, so
 * the panel holds no mirrored copy of a result and needs no `useEffect` to keep
 * two states in step. It is also a plain form: it submits, and works, without
 * JavaScript.
 *
 * NOTHING IS WRITTEN BY LOOKING. `intent=lookup` renders "ARES navrhuje:
 * <current> → <suggested>" per field and touches no identity column — the only
 * write it makes is the `ares_fetched_at` stamp. Accepting is a separate,
 * deliberate submit.
 *
 * NEITHER BUTTON EVER POSTS A VALUE. The checkboxes carry field NAMES; the
 * server re-derives what ARES said (from its 24h cache or a fresh call) and
 * writes its own value for each accepted name. Nothing here can put a string
 * into the identity card that the registry did not produce.
 *
 * "PŘIJMOUT VŠE" IS A SECOND BUTTON, NOT CLIENT STATE. Ticking every box
 * programmatically would mean controlling them, which would mean the panel
 * stops working without JavaScript; the server treats `intent=acceptAll` as
 * "every suggestion I just derived", which is the same accept path and cannot
 * drift from it.
 *
 * WHY THE PANEL HAS ITS OWN IČO INPUT. HTML forbids nested forms, so this
 * cannot live inside the identity form below it. The input defaults to the
 * stored IČO and doubles as the correction the office types when the stored one
 * is wrong — reconcile against the right company first, then save.
 */

/** One `useActionState`, two server actions, chosen by the button pressed. */
async function dispatch(
  previous: NastaveniActionState,
  formData: FormData,
): Promise<NastaveniActionState> {
  return formData.get("intent") === "lookup"
    ? lookupAresAction(previous, formData)
    : acceptAresAction(previous, formData)
}

export function AresPanel({
  orgSlug,
  defaultIco,
  aresFetchedAt,
}: {
  orgSlug: string
  defaultIco: string | null
  /** Formatted for display by the server, or null when ARES was never asked. */
  aresFetchedAt: string | null
}) {
  const t = useBetaTranslations()
  const [state, formAction, pending] = React.useActionState(
    dispatch,
    NASTAVENI_ACTION_IDLE,
  )

  const suggestions = state.status === "suggestions" ? state.suggestions : []

  return (
    <section className="grid gap-4 rounded-lg border border-border-subtle p-4">
      <div className="grid gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {t("nastaveni.aresTitle")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("nastaveni.aresHint")}
        </p>
        {aresFetchedAt ? (
          <p className="text-xs text-muted-foreground">
            {t("nastaveni.aresStamp")} {aresFetchedAt}
          </p>
        ) : null}
      </div>

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="orgSlug" value={orgSlug} />

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ares-ico">{t("nastaveni.fieldIco")}</Label>
            <Input
              id="ares-ico"
              name="ico"
              defaultValue={defaultIco ?? ""}
              inputMode="numeric"
              autoComplete="off"
              className="w-40"
            />
          </div>
          <Button
            type="submit"
            name="intent"
            value="lookup"
            variant="outline"
            disabled={pending}
          >
            {pending ? t("nastaveni.pending") : t("nastaveni.aresLookup")}
          </Button>
        </div>

        {state.status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{t(state.error)}</AlertDescription>
          </Alert>
        ) : null}

        {state.status === "suggestions" && state.message ? (
          <Alert>
            <AlertDescription>{t(state.message)}</AlertDescription>
          </Alert>
        ) : null}

        {state.status === "suggestions" && suggestions.length === 0 ? (
          <Alert>
            <AlertDescription>
              {t(
                state.cached
                  ? "nastaveni.aresNoDiffCached"
                  : "nastaveni.aresNoDiff",
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {suggestions.length > 0 ? (
          <>
            <ul className="grid gap-2">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.field}
                  className="flex items-start gap-3 rounded-md bg-secondary/40 p-3"
                >
                  <Checkbox
                    id={`ares-${suggestion.field}`}
                    name="accept"
                    value={suggestion.field}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor={`ares-${suggestion.field}`}
                    className="grid gap-0.5 font-normal"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {t(IDENTITY_FIELD_LABEL[suggestion.field])}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {suggestion.current === null
                        ? t("nastaveni.aresEmptyCurrent")
                        : suggestion.current}
                      {" → "}
                      <span className="text-foreground">
                        {suggestion.suggested}
                      </span>
                    </span>
                  </Label>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                name="intent"
                value="accept"
                size="sm"
                disabled={pending}
              >
                {t("nastaveni.aresApplySelected")}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="acceptAll"
                size="sm"
                variant="outline"
                disabled={pending}
              >
                {t("nastaveni.aresAcceptAll")}
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </section>
  )
}
