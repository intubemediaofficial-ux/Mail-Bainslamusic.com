/**
 * SalesQL Prospector via the SalesQL MCP server (mcp.salesql.com).
 * `search_people` is free (0 credits) and works on every plan; it returns
 * obfuscated emails/phones plus counts, which is enough to decide who to enrich.
 *
 * Company name → organization UUID uses the dashboard autocomplete endpoint,
 * which needs the user's own SalesQL web session token (`sql_token` cookie).
 */
import { SalesqlError } from "./salesql";

const MCP_URL = "https://mcp.salesql.com/mcp";
const AUTOCOMPLETE_URL = "https://api.salesql.com/prospector/persons/organizations/autocomplete";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type ProspectPerson = {
  uuid: string;
  full_name: string;
  title?: string | null;
  headline?: string | null;
  linkedin_url?: string | null;
  location?: { city?: string | null; state?: string | null; country?: string | null } | null;
  organization?: { uuid?: string; name?: string; website?: string | null; website_domain?: string | null; linkedin_url?: string | null } | null;
  emails?: { email: string; type?: string; verified?: boolean }[];
  phones?: { phone: string; type?: string }[];
  n_emails?: number;
  n_work_emails?: number;
  n_phones?: number;
};

export type ProspectPage = { results: ProspectPerson[]; page: number; page_size: number; total: number; is_total_accurate?: boolean };
export type OrgMatch = { uuid: string; name: string; logo?: string | null };

type JsonRpcResponse = { result?: { content?: { type: string; text?: string }[]; isError?: boolean }; error?: { message?: string } };

class McpClient {
  private sid: string | null = null;
  private id = 0;
  private ready: Promise<void> | null = null;

  constructor(private apiKey: string) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": UA,
      ...(this.sid ? { "Mcp-Session-Id": this.sid } : {}),
    };
  }

  private async post(body: object): Promise<JsonRpcResponse | null> {
    const res = await fetch(MCP_URL, { method: "POST", headers: this.headers(), body: JSON.stringify(body), cache: "no-store" });
    this.sid = res.headers.get("mcp-session-id") || this.sid;
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new SalesqlError(res.status, "SalesQL API key rejected by MCP server");
    if (!res.ok) throw new SalesqlError(res.status, `SalesQL MCP error ${res.status}`);
    if (!text.trim()) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/event-stream")) {
      const datas = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
      const last = datas.at(-1);
      return last ? (JSON.parse(last) as JsonRpcResponse) : null;
    }
    return JSON.parse(text) as JsonRpcResponse;
  }

  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.post({ jsonrpc: "2.0", id: ++this.id, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "intubtool", version: "1.0" } } });
        await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  async call<T>(name: string, args: object): Promise<T> {
    await this.init();
    const r = await this.post({ jsonrpc: "2.0", id: ++this.id, method: "tools/call", params: { name, arguments: args } });
    if (!r) throw new SalesqlError(502, "Empty response from SalesQL MCP");
    if (r.error) throw new SalesqlError(500, r.error.message || "SalesQL MCP error");
    const text = r.result?.content?.find((c) => c.type === "text")?.text ?? "";
    if (r.result?.isError) {
      const m = text.match(/\[(\w+)\]\s*(.*)/);
      const msg = m ? m[2] : text;
      const status = /rate limit/i.test(text) ? 429 : /credit|plan/i.test(text) ? 402 : 400;
      throw new SalesqlError(status, msg.slice(0, 300) || "SalesQL MCP tool error");
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new SalesqlError(502, `Unexpected SalesQL MCP payload: ${text.slice(0, 120)}`);
    }
  }
}

const clients = new Map<string, McpClient>();
const client = (apiKey: string) => {
  let c = clients.get(apiKey);
  if (!c) {
    c = new McpClient(apiKey);
    clients.set(apiKey, c);
  }
  return c;
};

export type SearchPeopleParams = {
  organization_uuids?: string[];
  job_titles?: string[];
  /** country UUIDs from `lookupValues("country", …)` */
  countries?: string[];
  /** state/city UUIDs from `lookupValues("region", …)` */
  states_or_cities?: string[];
  /** industry slugs from `lookupValues("industry", …)` */
  industries?: string[];
  has_emails?: boolean;
  has_phones?: boolean;
  page?: number;
  page_size?: number;
};

export type LookupType = "country" | "region" | "industry" | "company_size" | "company_type";
export type LookupValue = { value: string; label: string };

/** Resolve filter identifiers (countries/regions/industries) — SalesQL rejects guessed strings. */
export async function lookupValues(apiKey: string, type: LookupType, q?: string, size = 20): Promise<LookupValue[]> {
  const r = await client(apiKey).call<{ values?: LookupValue[] }>("lookup", { params: { type, q: q || null, size } });
  return r.values ?? [];
}

/** Map free-text filter values (e.g. "India", "Mumbai", "Music") to SalesQL identifiers; exact label match wins, else top hit. */
export async function resolveLookup(apiKey: string, type: LookupType, inputs: string[]) {
  const ids: string[] = [];
  const matched: string[] = [];
  const missing: string[] = [];
  for (const raw of inputs) {
    const q = raw.trim();
    if (!q) continue;
    const hits = await lookupValues(apiKey, type, q, 10);
    const exact = hits.find((h) => h.label.toLowerCase() === q.toLowerCase() || h.value.toLowerCase() === q.toLowerCase());
    const pick = exact ?? hits[0];
    if (pick) {
      ids.push(pick.value);
      matched.push(pick.label);
    } else missing.push(q);
  }
  return { ids: Array.from(new Set(ids)), matched, missing };
}

export function searchPeople(apiKey: string, params: SearchPeopleParams) {
  const page_size = Math.min(100, Math.max(20, params.page_size ?? 100));
  return client(apiKey).call<ProspectPage>("search_people", { params: { ...params, page: params.page ?? 1, page_size } });
}

export async function mcpAccountStatus(apiKey: string) {
  return client(apiKey).call<unknown>("get_account_status", {});
}

/** Dashboard autocomplete — needs the user's `sql_token` cookie value. */
export async function autocompleteOrganizations(webToken: string, query: string): Promise<OrgMatch[]> {
  const res = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { Authorization: `Token ${webToken}`, "Content-Type": "application/json", "User-Agent": UA, Origin: "https://dashboard.salesql.com", Referer: "https://dashboard.salesql.com/" },
    body: JSON.stringify({ query, current_only: true }),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new SalesqlError(res.status, "SalesQL web token expired — log in to dashboard.salesql.com and paste a fresh sql_token in Settings");
  if (res.status === 429) throw new SalesqlError(429, "SalesQL rate limit exceeded — try again in a minute");
  if (!res.ok) throw new SalesqlError(res.status, `SalesQL company lookup failed (${res.status})`);
  const data = (await res.json()) as { results?: OrgMatch[] };
  return data.results ?? [];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Accepts a company name or a LinkedIn company URL; returns the query text to autocomplete with. */
export function companyQuery(input: string) {
  const m = input.match(/linkedin\.com\/(?:company|school)\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]).replace(/[-_]+/g, " ").trim();
  return input.trim();
}

/**
 * Resolve a company to SalesQL organization UUIDs. Exact (normalised) name matches win
 * and are all included — SalesQL often has duplicate orgs ("Mediacube" / "MEDIACUBE").
 * Falls back to the top autocomplete hit.
 */
export async function resolveOrganizations(webToken: string, company: string): Promise<{ uuids: string[]; name: string } | null> {
  const q = companyQuery(company);
  if (!q) return null;
  const hits = await autocompleteOrganizations(webToken, q);
  if (!hits.length) return null;
  const want = norm(q);
  const exact = hits.filter((h) => norm(h.name) === want);
  const picked = exact.length ? exact : [hits[0]];
  return { uuids: picked.map((h) => h.uuid), name: picked[0].name };
}

/** Iterate all matching people for the given orgs/titles (max `limit`). */
export async function searchAllPeople(apiKey: string, params: Omit<SearchPeopleParams, "page" | "page_size">, limit: number) {
  const out: ProspectPerson[] = [];
  let total = 0;
  for (let page = 1; out.length < limit; page++) {
    const res = await searchPeople(apiKey, { ...params, page, page_size: 100 });
    total = res.total;
    out.push(...res.results);
    if (!res.results.length || out.length >= res.total) break;
  }
  return { people: out.slice(0, limit), total };
}
