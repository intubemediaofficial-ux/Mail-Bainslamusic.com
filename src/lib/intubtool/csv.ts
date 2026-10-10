/** Minimal RFC-4180 CSV parser (handles quoted fields with commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

const ALIASES: Record<string, string[]> = {
  fullName: ["full_name", "fullname", "name", "full name", "person", "contact name"],
  firstName: ["first_name", "firstname", "first name", "first"],
  lastName: ["last_name", "lastname", "last name", "last", "surname"],
  company: ["company_name", "company", "organization", "organisation", "current_company", "company name", "employer", "account"],
  title: ["current_position", "title", "job_title", "job title", "position", "designation", "role", "headline"],
  linkedinUrl: ["person_linkedin_url", "linkedin_url", "linkedin", "linkedin url", "profile_url", "profile url", "person linkedin url", "linkedin profile"],
  email: ["email", "email1", "work_email", "work email", "email address", "e-mail", "business email", "primary email"],
  phone: ["phone", "phone1", "mobile", "mobile_phone", "mobile phone", "phone number", "direct phone", "cell"],
  location: ["location", "person_country", "country", "city", "person_location", "region"],
  companyUrl: ["company_linkedin_url", "company linkedin", "company linkedin url", "company_url"],
  companyDomain: ["company_website", "website", "company website", "domain", "company_domain", "company domain"],
  category: ["category", "tag", "tags", "segment", "group"],
  notes: ["notes", "note", "comment", "comments"],
};

export type ImportMapping = Partial<Record<keyof typeof ALIASES, number>>;

export function autoMap(headers: string[]): ImportMapping {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const map: ImportMapping = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const a of aliases) {
      const idx = norm.indexOf(a);
      if (idx >= 0) {
        map[field as keyof typeof ALIASES] = idx;
        break;
      }
    }
  }
  return map;
}

export type ImportedRow = {
  fullName: string;
  company: string;
  title?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  location?: string;
  companyUrl?: string;
  companyDomain?: string;
  category?: string;
  notes?: string;
  emails: { email: string; type?: string; status?: string }[];
  phones: { phone: string; type?: string; status?: string }[];
};

const emailScore = (status?: string, type?: string) => {
  const s = (status || "").toLowerCase();
  const t = (type || "").toLowerCase();
  let n = 0;
  if (s === "valid" || s.includes("verified")) n += 4;
  if (s.includes("accept_all") || s.includes("catch")) n += 1;
  if (s.includes("invalid")) n -= 5;
  if (t === "job" || t.includes("work") || t.includes("business")) n += 2;
  return n;
};

/** Converts CSV rows to leads using the mapping; also picks up SalesQL-style email1..4/phone1..3 columns. */
export function rowsToLeads(headers: string[], rows: string[][], mapping: ImportMapping): ImportedRow[] {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const col = (name: string) => norm.indexOf(name);
  const get = (r: string[], i?: number) => (i == null || i < 0 ? "" : (r[i] || "").trim());
  const out: ImportedRow[] = [];

  for (const r of rows) {
    let fullName = get(r, mapping.fullName);
    if (!fullName) fullName = `${get(r, mapping.firstName)} ${get(r, mapping.lastName)}`.trim();
    const company = get(r, mapping.company);
    if (!fullName) continue;

    const emails: ImportedRow["emails"] = [];
    const phones: ImportedRow["phones"] = [];
    for (let n = 1; n <= 6; n++) {
      const e = get(r, col(`email${n}`));
      if (e) emails.push({ email: e.toLowerCase(), type: get(r, col(`email${n}_type`)) || undefined, status: get(r, col(`email${n}_status`)) || undefined });
      const p = get(r, col(`phone${n}`));
      if (p) phones.push({ phone: p, type: get(r, col(`phone${n}_type`)) || undefined, status: get(r, col(`phone${n}_status`)) || undefined });
    }
    const mappedEmail = get(r, mapping.email).toLowerCase();
    if (mappedEmail && !emails.some((x) => x.email === mappedEmail)) emails.unshift({ email: mappedEmail });
    const mappedPhone = get(r, mapping.phone);
    if (mappedPhone && !phones.some((x) => x.phone === mappedPhone)) phones.unshift({ phone: mappedPhone });

    const bestEmail = [...emails].sort((a, b) => emailScore(b.status, b.type) - emailScore(a.status, a.type))[0]?.email;
    const bestPhone =
      [...phones].sort((a, b) => {
        const s = (x: typeof a) => ((x.type || "").includes("mobile") || (x.type || "").includes("direct") ? 2 : 0) + ((x.status || "") === "valid" ? 1 : 0);
        return s(b) - s(a);
      })[0]?.phone;

    out.push({
      fullName,
      company: company || "Unknown",
      title: get(r, mapping.title) || undefined,
      linkedinUrl: get(r, mapping.linkedinUrl) || undefined,
      email: bestEmail,
      phone: bestPhone,
      location: get(r, mapping.location) || undefined,
      companyUrl: get(r, mapping.companyUrl) || undefined,
      companyDomain: get(r, mapping.companyDomain) || undefined,
      category: get(r, mapping.category) || undefined,
      notes: get(r, mapping.notes) || undefined,
      emails,
      phones,
    });
  }
  return out;
}
