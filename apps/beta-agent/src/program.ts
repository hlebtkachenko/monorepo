/**
 * The command surface, as a function of its inputs.
 *
 * `run()` takes argv, the environment, a writer and an injectable `fetch`, and
 * RETURNS an exit code instead of calling `process.exit`. That is what makes the
 * whole CLI — including every refusal path and the `--dry-run` output — testable
 * without a process boundary and without a network. `src/cli.ts` is the four
 * lines that bind it to the real process.
 *
 * THREE COMMANDS, NO MORE:
 *   `check`             the handshake — is this key live, what can it reach
 *   `datasets`          what this agent can read and where each one publishes
 *   `publish <dataset>` transform a file and send it
 *
 * `--dry-run` is a first-class path, not a debug flag: it needs NO credentials,
 * so the office can prove a Money S3 export parses before a key is ever issued,
 * and it prints the exact body that would be posted.
 */
import { readFile } from "node:fs/promises"
import { Command } from "commander"

import { AgentError, getMeta, publish, type Fetch } from "./client"
import { ConfigError, readConfig, type AgentConfig } from "./config"
import {
  DATASETS,
  DATASET_NAMES,
  describeTarget,
  isDatasetName,
  transform,
  type Dataset,
  type TransformFailure,
} from "./datasets"
import { idempotencyKey, isValidIdempotencyKey } from "./idempotency"
import { formatPeriod, parsePeriod, type Period } from "./period"

const VERSION = "0.0.1"

export type Io = { write: (line: string) => void }

type PublishOptions = {
  file: string
  org: string
  period?: string
  dryRun?: boolean
  idempotencyKey?: string
}

export async function run(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  io: Io,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<number> {
  const program = new Command()
  program
    .name("beta-agent")
    .description(
      "Kancelářský agent Afframe beta — načte exporty z Money S3, převede je a publikuje do portálu.",
    )
    .version(VERSION)
    .exitOverride()
    .configureOutput({
      // commander's own text already ends in a newline; the writer adds one.
      writeOut: (text) => io.write(text.replace(/\n$/, "")),
      writeErr: (text) => io.write(text.replace(/\n$/, "")),
    })

  let exitCode = 0

  program
    .command("check")
    .description(
      "Ověří klíč agenta a vypíše, ke kterým firmám a datovým sadám má přístup.",
    )
    .action(async () => {
      exitCode = await runCheck(env, io, fetchImpl)
    })

  program
    .command("datasets")
    .description(
      "Vypíše datové sady, které agent umí načíst, a jejich stav v portálu.",
    )
    .action(() => {
      exitCode = runDatasets(io)
    })

  program
    .command("publish")
    .argument("<dataset>", `datová sada: ${DATASET_NAMES.join(" | ")}`)
    .requiredOption("--file <path>", "cesta k CSV exportu")
    .requiredOption("--org <slug>", "identifikátor firmy v portálu (slug)")
    .option("--period <YYYY-MM>", "období: 2026-07, 2026-Q3 nebo 2026")
    .option("--dry-run", "jen převede a vypíše tělo požadavku, nic neodešle")
    .option(
      "--idempotency-key <value>",
      "vlastní Idempotency-Key místo odvozeného z obsahu",
    )
    .description("Převede CSV export a publikuje ho do portálu.")
    .action(async (dataset: string, options: PublishOptions) => {
      exitCode = await runPublish(dataset, options, env, io, fetchImpl)
    })

  try {
    await program.parseAsync([...argv], { from: "user" })
  } catch (error) {
    // commander's own exits (`--help`, `--version`, a missing required option).
    const code = (error as { exitCode?: number }).exitCode
    if (typeof code === "number") return code
    throw error
  }
  return exitCode
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

async function runCheck(
  env: NodeJS.ProcessEnv,
  io: Io,
  fetchImpl: Fetch,
): Promise<number> {
  const config = configOrRefuse(env, io)
  if (config === null) return 1

  try {
    const meta = await getMeta(config, fetchImpl)
    io.write(`Klíč je platný: ${meta.key.label}`)
    io.write(
      meta.key.scope === "office"
        ? "Rozsah: celá kancelář (všechny firmy, kde je účetní vlastníkem)."
        : "Rozsah: jedna firma.",
    )
    io.write("")
    io.write("Firmy:")
    for (const org of meta.organizations) {
      io.write(`  ${org.slug} — ${org.legalName}`)
    }
    if (meta.organizations.length === 0) {
      io.write("  (žádná — klíč nemá přístup k žádné aktivní firmě)")
    }
    io.write("")
    io.write("Datové sady portálu:")
    for (const dataset of meta.datasets) {
      const state = dataset.implemented
        ? "dostupné"
        : `zatím nedostupné${dataset.note ? ` — ${dataset.note}` : ""}`
      io.write(`  ${dataset.path}: ${state}`)
    }
    return 0
  } catch (error) {
    return report(error, io)
  }
}

// ---------------------------------------------------------------------------
// datasets
// ---------------------------------------------------------------------------

function runDatasets(io: Io): number {
  for (const name of DATASET_NAMES) {
    const dataset = DATASETS[name]
    const target = dataset.path
      ? `→ ${dataset.path}`
      : `→ zatím bez koncového bodu (${dataset.pending}); --dry-run funguje`
    io.write(`${name.padEnd(13)} ${dataset.label.padEnd(34)} ${target}`)
  }
  return 0
}

// ---------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------

async function runPublish(
  name: string,
  options: PublishOptions,
  env: NodeJS.ProcessEnv,
  io: Io,
  fetchImpl: Fetch,
): Promise<number> {
  if (!isDatasetName(name)) {
    io.write(
      `Neznámá datová sada „${name}“. Dostupné: ${DATASET_NAMES.join(", ")}`,
    )
    return 1
  }
  const dataset = DATASETS[name]

  let period: Period | null = null
  if (options.period !== undefined) {
    period = parsePeriod(options.period)
    if (period === null) {
      io.write(
        `Období „${options.period}“ nelze přečíst. Očekává se 2026-07, 2026-Q3 nebo 2026.`,
      )
      return 1
    }
  }

  if (
    options.idempotencyKey !== undefined &&
    !isValidIdempotencyKey(options.idempotencyKey)
  ) {
    io.write(
      "Hodnota --idempotency-key má nepovolený tvar. Povoleny jsou znaky A-Z a-z 0-9 . _ : - a délka do 200 znaků.",
    )
    return 1
  }

  // Credentials are checked BEFORE the file is read, so a shell that is not set
  // up is a first-second failure rather than one that arrives after a 5 000-row
  // předvaha has been transformed. `--dry-run` needs none of it.
  let config: AgentConfig | null = null
  if (options.dryRun !== true) {
    config = configOrRefuse(env, io)
    if (config === null) return 1
  }

  let text: string
  try {
    text = await readFile(options.file, "utf8")
  } catch {
    io.write(`Soubor nelze otevřít: ${options.file}`)
    return 1
  }

  const result = transform(dataset, text, { period })
  if (!result.ok) {
    io.write(`Soubor ${options.file} nelze publikovat jako ${dataset.label}:`)
    for (const line of explain(result, dataset)) io.write(`  ${line}`)
    return 1
  }

  io.write(`${describeTarget(dataset, period)}: ${rows(result.rowCount)}`)
  io.write(
    `Rozpoznané sloupce: ${Object.entries(result.columns)
      .map(([field, header]) => `${header} → ${field}`)
      .join(", ")}`,
  )

  if (options.dryRun === true) {
    io.write(JSON.stringify(result.payload, null, 2))
    io.write(
      dataset.path === null
        ? `(--dry-run) Koncový bod pro tuto sadu zatím neexistuje — ${dataset.pending}.`
        : `(--dry-run) Neodesláno. Cíl by byl POST /api/agent/v1/orgs/${options.org}/${dataset.path}.`,
    )
    return 0
  }

  if (dataset.path === null) {
    io.write(
      `Datová sada „${name}“ zatím nemá v portálu koncový bod (${dataset.pending}). ` +
        "Soubor je přečtený a platný — spusťte příkaz s --dry-run a výstup si uschovejte, publikovat půjde po nasazení té části.",
    )
    return 1
  }

  const key =
    options.idempotencyKey ??
    idempotencyKey({
      path: dataset.path,
      orgSlug: options.org,
      period: period === null ? null : formatPeriod(period),
      payload: result.payload,
    })

  try {
    const response = await publish(
      config!,
      {
        orgSlug: options.org,
        path: dataset.path,
        payload: result.payload,
        idempotencyKey: key,
      },
      fetchImpl,
    )
    io.write(
      response.status === "applied"
        ? `Publikováno do ${response.organization}: ${JSON.stringify(response.summary)}`
        : `Beze změny — portál tento požadavek už zpracoval dříve (${response.organization}): ${JSON.stringify(response.summary)}`,
    )
    io.write(`Idempotency-Key: ${key}`)
    return 0
  } catch (error) {
    return report(error, io)
  }
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

function configOrRefuse(env: NodeJS.ProcessEnv, io: Io): AgentConfig | null {
  try {
    return readConfig(env)
  } catch (error) {
    if (error instanceof ConfigError) {
      io.write(error.message)
      return null
    }
    throw error
  }
}

/** Czech counts the noun, not the number: 1 řádek, 2-4 řádky, 5+ řádků. */
function rows(count: number): string {
  if (count === 1) return "1 řádek"
  if (count >= 2 && count <= 4) return `${count} řádky`
  return `${count} řádků`
}

function report(error: unknown, io: Io): number {
  if (error instanceof AgentError) {
    io.write(error.message)
    return error.exitCode
  }
  throw error
}

const STRUCTURAL: Readonly<Record<string, string>> = {
  empty_file: "Soubor je prázdný.",
  unterminated_quote: "Neuzavřené uvozovky — soubor skončil uprostřed hodnoty.",
  no_data_rows: "Soubor obsahuje jen hlavičku, žádná data.",
  too_many_rows:
    "Soubor má víc než 5 000 řádků — nejde nejspíš o měsíční export.",
  missing_period:
    "Chybí --period. Tato sada se publikuje za konkrétní období (např. --period 2026-07).",
}

const ISSUE: Readonly<Record<string, string>> = {
  missing_value: "chybí povinná hodnota",
  invalid_amount:
    "částku nelze přečíst (očekává se např. 1 234,50 nebo 1234.50)",
  invalid_integer: "celé číslo mimo povolený rozsah",
  invalid_date: "datum nelze přečíst (očekává se 31.7.2026 nebo 2026-07-31)",
  invalid_period:
    "období nelze přečíst; doplňte sloupec Období nebo použijte --period",
  unknown_value: "hodnotu nelze zařadit do číselníku",
  duplicate_row: "stejný záznam je v souboru dvakrát",
  ragged_row: "řádek má víc buněk než hlavička sloupců",
  column_shape: "řádek nese sloupce druhé strany rozvahy",
}

/** The refusal, as lines the office can act on — never a stack, never a code alone. */
function explain(failure: TransformFailure, dataset: Dataset): string[] {
  if (failure.structural !== null) {
    return [STRUCTURAL[failure.structural] ?? failure.structural]
  }
  if (failure.missingColumns.length > 0) {
    return [
      `Chybí povinné sloupce: ${failure.missingColumns.join(", ")}.`,
      `Přijímané názvy hlaviček: ${Object.entries(dataset.aliases)
        .map(([field, names]) => `${field}=${names.join("/")}`)
        .join("; ")}`,
    ]
  }
  if (failure.schemaIssues.length > 0) {
    return [
      "Portál by tato data odmítl (kontrola proběhla lokálně, nic nebylo odesláno):",
      ...failure.schemaIssues.map((issue) => `${issue.path}: ${issue.code}`),
    ]
  }
  return failure.issues
    .slice(0, 50)
    .map(
      (issue) =>
        `řádek ${issue.line}${issue.column ? `, sloupec ${issue.column}` : ""}: ${ISSUE[issue.code] ?? issue.code}`,
    )
}
