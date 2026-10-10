const BASE = "https://api-public.salesql.com/v1";

export type SalesqlEmail = { email: string; type?: string; status?: string };
export type SalesqlPhone = { phone: string; type?: string; country_code?: string; is_valid?: boolean };
export type SalesqlPerson = {
  uuid: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  headline?: string;
  linkedin_url?: string;
  location?: { city?: string; state?: string; country?: string };
  emails?: SalesqlEmail[];
  phones?: SalesqlPhone[];
  organization?: { name?: string; website?: string; website_domain?: string; linkedin_url?: string };
};
export type SalesqlAllowance = { credits: { emails_and_phones: number; verifications: number }; reset_date: string };

export class SalesqlError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const d = data as { detail?: unknown; error?: string } | null;
    let msg = "";
    if (d?.error === "invalid_key") msg = "SalesQL API key is invalid";
    else if (typeof d?.detail === "string") msg = d.detail;
    else if (d?.detail) msg = JSON.stringify(d.detail);
    if (res.status === 429) msg = msg || "SalesQL rate limit exceeded — try again in a minute";
    if (res.status === 404) msg = msg || "Not found in SalesQL";
    throw new SalesqlError(res.status, msg || `SalesQL error ${res.status}`);
  }
  return data as T;
}

export const salesql = {
  allowance: (key: string) => call<SalesqlAllowance>(key, "/allowance"),

  enrichPerson: (key: string, q: { linkedin_url?: string; full_name?: string; organization_name?: string; organization_domain?: string; email?: string }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
    return call<SalesqlPerson>(key, `/persons/enrich?${params}`);
  },

  enrichPersonsBulk: (key: string, items: Array<{ linkedin_url?: string; full_name?: string; organization_name?: string; organization_domain?: string }>) =>
    call<unknown>(key, "/persons/enrich/bulk", { method: "POST", body: JSON.stringify(items.slice(0, 100)) }),
};

export function pickBestEmail(emails: SalesqlEmail[] = []) {
  const score = (e: SalesqlEmail) => {
    let s = 0;
    if ((e.status || "").toLowerCase().includes("valid") || (e.status || "").toLowerCase() === "verified") s += 4;
    if ((e.type || "").toLowerCase().includes("work")) s += 2;
    if ((e.status || "").toLowerCase().includes("catch")) s -= 1;
    if ((e.status || "").toLowerCase().includes("invalid")) s -= 5;
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a))[0];
}

export function pickBestPhone(phones: SalesqlPhone[] = []) {
  const score = (p: SalesqlPhone) => (p.is_valid ? 2 : 0) + ((p.type || "").toLowerCase().includes("mobile") || (p.type || "").toLowerCase().includes("direct") ? 3 : 0);
  return [...phones].sort((a, b) => score(b) - score(a))[0];
}
