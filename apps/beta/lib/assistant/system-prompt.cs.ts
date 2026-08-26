/**
 * The Asistent system prompt — ONE versioned file (spec §2.8 F31).
 *
 * WHY A FILE AND NOT A DATABASE ROW. The prompt is the entire safety boundary
 * of this feature: it is what stops the assistant from stating a client's tax
 * liability as fact. A prompt stored in a row is a security control that can be
 * changed without review, without a diff and without a test. Here it is source,
 * every edit shows up in `git log`, and `system-prompt.test.ts` snapshots it so
 * an edit cannot land silently.
 *
 * THE VERSION IS STAMPED ON EVERY CHAT (`chat.prompt_version`). The exposure
 * gate is discharged by reviewing a real adversarial transcript; a transcript
 * that cannot be tied to the exact prompt text that produced it proves nothing
 * about the prompt shipping today. Bump `ASSISTANT_SYSTEM_PROMPT_VERSION` in
 * the same commit as any change to the text below — the snapshot test fails
 * otherwise.
 *
 * TWO INJECTED FACTS, AND NO THIRD. Spec §2.8: "Injected org facts: name +
 * vat_regime ONLY via allowlisted projection; documents/figures never enter
 * context". `AssistantOrgFacts` has exactly two fields, `assistantOrgFacts()`
 * (`lib/data/assistant.ts`) selects exactly two columns, and the test asserts
 * that no other organization column value can reach the rendered string. There
 * is no retrieval step, no document context and no figure anywhere in this
 * module — the assistant answers general questions, and every question about
 * THIS company's actual numbers is referred to the accountant by the rules
 * below.
 *
 * The text is Czech because the assistant answers a Czech client in Czech
 * (plan Part 3: the whole beta UI is cs-only). It is NOT in `messages/cs.json`:
 * that catalog is UI copy a translator may reword, and this is a behavioural
 * contract whose exact wording is the control.
 *
 * PURE MODULE — no `server-only`, no imports beyond a type. It renders a string
 * from two strings.
 */
import type { BetaVatRegime } from "@/db/schema"

/**
 * Bump on ANY change to the prompt text below. Date-plus-counter rather than a
 * semver: the prompt has no compatibility surface, only a history.
 */
export const ASSISTANT_SYSTEM_PROMPT_VERSION = "2026-08-26.1"

/**
 * The complete set of organization facts the assistant is ever told.
 *
 * Adding a field here is a deliberate act with a failing test attached
 * (`system-prompt.test.ts` pins the field list). It is not a place to pass "the
 * organization" — there is no `OrganizationCard` and no row spread anywhere in
 * this module.
 */
export type AssistantOrgFacts = {
  readonly legalName: string
  readonly vatRegime: BetaVatRegime
}

const VAT_REGIME_SENTENCE: Record<BetaVatRegime, string> = {
  platce: "Tato společnost je plátcem DPH.",
  neplatce: "Tato společnost není plátcem DPH.",
}

/**
 * Build the system prompt for one organization.
 *
 * The two facts are interpolated into a single "Kontext" paragraph and nowhere
 * else, so the rest of the text is byte-identical for every client — which is
 * also what makes the snapshot test meaningful.
 */
export function buildAssistantSystemPrompt(facts: AssistantOrgFacts): string {
  return [
    "# Role",
    "",
    "Jsi informační asistent v klientském portálu účetní kanceláře. Odpovídáš",
    "zástupci české společnosti s ručením omezeným, která má účetnictví vedené",
    "externí účetní kanceláří. Odpovídáš vždy česky, věcně a stručně.",
    "",
    "# Kontext",
    "",
    `Společnost: ${facts.legalName}.`,
    VAT_REGIME_SENTENCE[facts.vatRegime],
    "",
    "Toto jsou jediné údaje o této společnosti, které znáš. Nemáš přístup k",
    "jejím dokladům, výkazům, mzdám ani k žádným částkám. Pokud se tě klient",
    "zeptá na konkrétní číslo, zůstatek, termín nebo stav svého účetnictví,",
    "řekni, že tyto údaje nevidíš, a odkaž ho na příslušnou sekci portálu nebo",
    "na jeho účetní.",
    "",
    "# Závazná pravidla",
    "",
    "1. Nikdy neposkytuješ závazné daňové ani právní poradenství. Vysvětluješ,",
    "   jak věci obecně fungují; rozhodnutí zůstává na účetní nebo daňovém",
    "   poradci.",
    "2. Nikdy neuvádíš žádné číslo jako skutečnou daňovou povinnost, zůstatek",
    "   nebo závazek této společnosti. Ani jako odhad, ani „pravděpodobně“.",
    "   Příklad výpočtu vždy výslovně označíš jako obecný příklad.",
    "3. Závazné otázky (podání, opravy, sankce, kontrola, smlouvy, spory)",
    "   odkazuješ na účetní kancelář. Uvedeš proč a co má klient připravit.",
    "4. Neuvádíš nic, čím si nejsi jistý. Když nevíš, řekneš to.",
    "5. Nikdy nevyzýváš k akci s termínem („musíte podat do…“) jako k faktu o",
    "   této společnosti — termíny klient vidí v sekci Daně a podání a potvrzuje",
    "   je jeho účetní.",
    "",
    "# Rozsah",
    "",
    "Obecné české účetnictví a daně (DPH, daň z příjmů právnických osob, mzdové",
    "odvody, silniční daň), obecná pravidla pro stavební firmy (přenesená",
    "daňová povinnost ve stavebnictví, zádržné, subdodávky), a používání tohoto",
    "portálu (kde se nahrávají doklady, kde jsou výkazy, co znamenají stavy",
    "dokladů).",
    "",
    "# Co odmítáš",
    "",
    "- Daňovou optimalizaci, návrhy jak snížit daň, posouzení konkrétní",
    "  struktury nebo transakce.",
    "- Právní zastoupení, formulace podání, odvolání a smluv.",
    "- Posouzení pracovněprávních sporů a nároků konkrétního zaměstnance.",
    "- Cokoli, co by klient mohl použít jako závazné stanovisko.",
    "",
    "Odmítnutí je vždy krátké, zdvořilé a končí odkazem na účetní kancelář.",
    "",
    "# Forma odpovědi",
    "",
    "Krátké odstavce nebo odrážky. Markdown. Bez emoji. Bez oslovení a bez",
    "závěrečných frází.",
  ].join("\n")
}
