/**
 * The HTTP half: one GET (the handshake) and one POST (every dataset), plus the
 * translation of beta's closed error vocabulary into sentences an accountant can
 * act on.
 *
 * WHY THE MESSAGES ARE CZECH AND THE CODE IS ENGLISH. The reader of an error
 * here is the office — the same person who reads the portal — and `409
 * idempotency_key_reused` tells them nothing about what to do next. The
 * mapping is exhaustive over `AgentErrorCode` (`apps/beta/lib/agent/http.ts`),
 * so a code beta adds without a message here still surfaces its own name rather
 * than being swallowed.
 *
 * THE KEY NEVER APPEARS. It is set on one header and is not part of any message,
 * any thrown error, or any successful output. `src/cli.test.ts` asserts that
 * over every failure path, because "we were careful" is not a guarantee.
 */
import type { AgentConfig } from "./config"

/** 1 = the office must change something. 2 = the portal or the network did. */
export type ExitCode = 1 | 2

export class AgentError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode,
  ) {
    super(message)
  }
}

export type MetaResponse = {
  readonly key: {
    readonly label: string
    readonly scope: "office" | "organization"
  }
  readonly organizations: readonly {
    readonly slug: string
    readonly legalName: string
  }[]
  readonly datasets: readonly {
    readonly path: string
    readonly implemented: boolean
    readonly note?: string
  }[]
}

export type PublishResponse = {
  readonly status: "applied" | "replayed"
  readonly organization: string
  readonly summary: Record<string, unknown>
}

/** Injectable so the tests exercise the real mapping against a stub server. */
export type Fetch = typeof globalThis.fetch

const API_PREFIX = "/api/agent/v1"
const TIMEOUT_MS = 60_000

export async function getMeta(
  config: AgentConfig,
  fetchImpl: Fetch = globalThis.fetch,
): Promise<MetaResponse> {
  const response = await send(
    fetchImpl,
    `${config.baseUrl}${API_PREFIX}/meta`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.key}`,
        accept: "application/json",
      },
    },
  )
  return (await decode(response, null)) as MetaResponse
}

export async function publish(
  config: AgentConfig,
  input: {
    readonly orgSlug: string
    readonly path: string
    readonly payload: unknown
    readonly idempotencyKey: string
  },
  fetchImpl: Fetch = globalThis.fetch,
): Promise<PublishResponse> {
  const url = `${config.baseUrl}${API_PREFIX}/orgs/${encodeURIComponent(input.orgSlug)}/${input.path}`
  const response = await send(fetchImpl, url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.key}`,
      accept: "application/json",
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input.payload),
  })
  return (await decode(response, input.orgSlug)) as PublishResponse
}

async function send(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // A transport failure is never the office's fault and never their fix: the
    // portal is asleep, the tunnel is down, or the laptop is offline.
    const reason = error instanceof Error ? error.message : String(error)
    throw new AgentError(
      `Portál není dostupný na ${url}. Zkontrolujte připojení a adresu v BETA_AGENT_URL. (${reason})`,
      2,
    )
  }
}

async function decode(
  response: Response,
  orgSlug: string | null,
): Promise<unknown> {
  const text = await response.text()
  let body: unknown
  try {
    body = text === "" ? null : JSON.parse(text)
  } catch {
    body = null
  }

  if (response.ok) {
    if (body === null) {
      throw new AgentError("Portál vrátil prázdnou odpověď (HTTP 200).", 2)
    }
    return body
  }

  const record = (body ?? {}) as Record<string, unknown>
  const code = typeof record["error"] === "string" ? record["error"] : "unknown"
  throw new AgentError(
    describe(response, code, record, orgSlug),
    response.status >= 500 ? 2 : 1,
  )
}

function describe(
  response: Response,
  code: string,
  body: Record<string, unknown>,
  orgSlug: string | null,
): string {
  switch (code) {
    case "unauthorized":
      return "Klíč agenta nebyl přijat (401). Ověřte BETA_AGENT_KEY — klíč mohl být v /admin odvolán nebo patří jinému prostředí."
    case "rate_limited": {
      const retry = response.headers.get("retry-after") ?? "?"
      return `Příliš mnoho požadavků (429). Zkuste to znovu za ${retry} s.`
    }
    case "not_found":
      return `Organizace „${orgSlug ?? "?"}“ není pro tento klíč dostupná (404). Zkontrolujte --org, nebo že klíč má rozsah na tuto firmu (beta-agent check vypíše seznam).`
    case "invalid_json":
      return "Portál nepřečetl tělo požadavku (400). Nahlaste to jako chybu agenta."
    case "invalid_body":
      return `Portál odmítl data (400). Neplatná pole: ${issueList(body)}`
    case "tenancy_key_in_payload":
      return `Data obsahují klíč organizace nebo uživatele, který server nepřijímá: ${listOf(body["keys"])}. Odstraňte tyto sloupce ze vstupního souboru.`
    case "invalid_idempotency_key":
      return "Hodnota --idempotency-key má nepovolený tvar (400). Povoleny jsou jen znaky A-Z a-z 0-9 . _ : - a délka do 200 znaků."
    case "payload_too_large":
      return "Soubor je pro jedno odeslání příliš velký (413). Rozdělte export na menší části."
    case "unsupported_media_type":
      return "Portál očekává application/json (415). Nahlaste to jako chybu agenta."
    case "idempotency_key_reused":
      return "Zadaný Idempotency-Key už byl použit na JINOU operaci nebo jinou firmu (409). Použijte jinou hodnotu --idempotency-key, nebo parametr vynechte a nechte klíč odvodit z obsahu."
    case "identity_changed":
      return "Řádek s tímto ID už v portálu existuje pod jiným druhem nebo obdobím (409). Portál identitu nepřepisuje — použijte pro opravený řádek nové ID."
    case "conflict":
      return "Portál operaci odmítl kvůli aktuálnímu stavu (409). Načtěte stav v Pro účetní › Měsíční uzávěrka a zkuste to znovu."
    default:
      return response.status >= 500
        ? `Portál odpověděl chybou ${response.status}. Zkuste to znovu později; pokud potíže trvají, jde o výpadek portálu.`
        : `Portál požadavek odmítl (HTTP ${response.status}, kód „${code}“).`
  }
}

function issueList(body: Record<string, unknown>): string {
  const issues = body["issues"]
  if (!Array.isArray(issues) || issues.length === 0)
    return "(server neuvedl pole)"
  return issues
    .slice(0, 10)
    .map((issue) => {
      const record = issue as Record<string, unknown>
      return `${String(record["path"] ?? "?")} (${String(record["code"] ?? "?")})`
    })
    .join(", ")
}

function listOf(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(", ") : "(neuvedeno)"
}
