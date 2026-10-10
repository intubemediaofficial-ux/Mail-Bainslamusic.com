import { ok, fail } from "@/app/api/admin/_lib";
import { getSettings } from "@/lib/intubtool/settings";
import { lookupValues, type LookupType } from "@/lib/intubtool/salesql-mcp";

export const dynamic = "force-dynamic";

const TYPES: LookupType[] = ["country", "region", "industry", "company_size", "company_type"];

/** ?type=country|region|industry&q=India — suggestions for designation-search filters. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") as LookupType | null;
  if (!type || !TYPES.includes(type)) return fail("Invalid type");
  const q = (sp.get("q") || "").trim();
  const s = await getSettings();
  if (!s.salesql_api_key) return fail("SalesQL API key not set — add it in Settings.");
  try {
    const values = await lookupValues(s.salesql_api_key, type, q || undefined, 15);
    return ok({ values });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
