import { ok } from "@/app/api/admin/_lib";
import { requireAdmin } from "@/lib/auth";
import { testAlert } from "@/lib/intubtool/account-health";
import { denied } from "../../blasts/_lib";

export const dynamic = "force-dynamic";

/** POST → sends a test alert through the configured channels and reports which ones worked. */
export async function POST() {
  if (!(await requireAdmin())) return denied();
  const r = await testAlert();
  const parts = [`Email ${r.email ? "sent" : "failed"}`, `WhatsApp ${r.whatsapp ? "sent" : "not sent"}`];
  return ok({ ...r, message: parts.join(" · ") });
}
