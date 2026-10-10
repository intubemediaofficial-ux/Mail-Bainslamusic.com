import dns from "dns/promises";

export type VerifyStatus = "valid" | "risky" | "invalid";
export type VerifyResult = { status: VerifyStatus; note: string };

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "sharklasers.com",
  "getnada.com", "dispostable.com", "maildrop.cc", "fakeinbox.com", "throwawaymail.com", "mohmal.com", "emailondeck.com",
]);
const ROLE = /^(info|sales|support|admin|contact|hello|help|office|billing|accounts|hr|careers|jobs|marketing|team|noreply|no-reply|postmaster|webmaster|abuse|mail|enquiries|enquiry|press|media)$/i;
const SYNTAX = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([a-z0-9-]+\.)+[a-z]{2,}$/i;

const mxCache = new Map<string, Promise<boolean>>();

function hasMx(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached) return cached;
  const p = (async () => {
    const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 6000));
    try {
      const mx = await Promise.race([dns.resolveMx(domain), timeout]);
      if (mx === "timeout") return true; // can't tell → don't mark invalid
      if (Array.isArray(mx) && mx.length) return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code && !["ENOTFOUND", "ENODATA"].includes(code)) return true; // resolver trouble → benefit of doubt
    }
    try {
      const a = await Promise.race([dns.resolve4(domain), timeout]);
      return a === "timeout" || (Array.isArray(a) && a.length > 0);
    } catch {
      return false;
    }
  })();
  mxCache.set(domain, p);
  return p;
}

/** Syntax + disposable + role + DNS/MX check. Never does SMTP probing (Gmail-hosted VPS can't). */
export async function verifyEmail(raw: string): Promise<VerifyResult> {
  const email = raw.trim().toLowerCase();
  if (!SYNTAX.test(email)) return { status: "invalid", note: "Bad email format" };
  const [local, domain] = email.split("@");
  if (DISPOSABLE.has(domain)) return { status: "invalid", note: "Disposable email domain" };
  if (!(await hasMx(domain))) return { status: "invalid", note: "Domain has no mail server (MX)" };
  if (ROLE.test(local)) return { status: "risky", note: "Role address (info@/sales@…) — may be shared inbox" };
  return { status: "valid", note: "Format + mail server OK" };
}

export async function verifyMany<T extends { email: string }>(items: T[], concurrency = 20): Promise<Map<T, VerifyResult>> {
  const out = new Map<T, VerifyResult>();
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const it = items[i++];
      out.set(it, await verifyEmail(it.email));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
