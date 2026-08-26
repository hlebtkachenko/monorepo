/**
 * The MANUAL adversarial probe runner (spec §2.8 F31).
 *
 * Runs every probe in `lib/assistant/adversarial-prompts.cs.ts` against the
 * real model, through the real provider boundary and the real system prompt,
 * and prints a Markdown transcript. The transcript is the artefact reviewed
 * before `BETA_ASSISTANT_ENABLED` is ever set to "true" for a client — it is
 * committed once, by hand, at that point.
 *
 * NOT A TEST, AND DELIBERATELY NOT IN CI. Running it costs money and its output
 * is non-deterministic; a flaky gate on every PR gets switched off within a
 * week, and a mocked model would be asserting against our own fixture rather
 * than against the prompt. `adversarial-prompts.test.ts` covers everything
 * about the probe set that IS checkable offline.
 *
 * It refuses to start without `BETA_ASSISTANT_API_KEY`, and it reads the key
 * only through `lib/assistant/provider.ts` — the same one place the application
 * does. It does not touch the database and it does not need the app running.
 *
 *   BETA_ASSISTANT_API_KEY=... pnpm exec tsx apps/beta/scripts/assistant-probe.ts \
 *     > docs/... (wherever the reviewed transcript is filed)
 *
 * Optional: BETA_ASSISTANT_MODEL, BETA_ASSISTANT_MAX_TOKENS.
 */
import {
  readAssistantApiKey,
  readAssistantConfig,
} from "../lib/assistant/config"
import { ASSISTANT_ADVERSARIAL_PROBES } from "../lib/assistant/adversarial-prompts.cs"
import { streamAssistantTurn } from "../lib/assistant/provider"
import {
  ASSISTANT_SYSTEM_PROMPT_VERSION,
  buildAssistantSystemPrompt,
} from "../lib/assistant/system-prompt.cs"

/**
 * A stand-in book. The probes are about the PROMPT, not about any client, so
 * the two injected facts are obviously fictional — a real client's name must
 * never end up in a committed transcript.
 */
const FACTS = {
  legalName: "Vzorová stavební s.r.o.",
  vatRegime: "platce",
} as const

async function main(): Promise<void> {
  if (!readAssistantApiKey()) {
    console.error(
      "BETA_ASSISTANT_API_KEY is not set. This runner calls the real model on " +
        "purpose; there is no offline mode. See lib/assistant/" +
        "adversarial-prompts.test.ts for what is checked without a key.",
    )
    process.exitCode = 1
    return
  }

  const config = readAssistantConfig()
  const system = buildAssistantSystemPrompt(FACTS)

  console.log(`# Asistent — adversarial transcript`)
  console.log()
  console.log(`- Prompt version: \`${ASSISTANT_SYSTEM_PROMPT_VERSION}\``)
  console.log(`- Model: \`${config.model}\``)
  console.log(`- Run: ${new Date().toISOString()}`)
  console.log(`- Org facts: ${FACTS.legalName} / ${FACTS.vatRegime}`)
  console.log()

  for (const probe of ASSISTANT_ADVERSARIAL_PROBES) {
    console.log(`## ${probe.id} (${probe.rule})`)
    console.log()
    console.log(`**Dotaz:** ${probe.prompt}`)
    console.log()
    console.log(`**Očekávání:** ${probe.expectation}`)
    console.log()

    let answer = ""
    let failure: string | null = null
    let tokens = ""

    for await (const event of streamAssistantTurn({
      model: config.model,
      system,
      maxTokens: config.maxTokens,
      messages: [{ role: "user", content: probe.prompt }],
    })) {
      if (event.type === "text") answer += event.text
      else if (event.type === "usage") {
        tokens = `${event.inputTokens} in / ${event.outputTokens} out`
      } else failure = event.reason
    }

    console.log("**Odpověď:**")
    console.log()
    console.log(answer.trim() || "_(prázdná)_")
    console.log()
    if (failure) console.log(`> Selhání: \`${failure}\``)
    if (tokens) console.log(`> Tokeny: ${tokens}`)
    console.log()
  }
}

await main()
