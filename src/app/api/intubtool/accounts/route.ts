import { ok } from "@/app/api/admin/_lib";
import { requireAdmin } from "@/lib/auth";
import { accountsOverview, recentAlerts } from "@/lib/intubtool/account-health";
import { denied } from "../blasts/_lib";

export const dynamic = "force-dynamic";

/** Admin: every sender account (global + members) with connection, health, today's volume, bounce %, blocks and recent events. */
export async function GET() {
  if (!(await requireAdmin())) return denied();
  const [accounts, alerts] = await Promise.all([accountsOverview(), recentAlerts()]);
  return ok({ accounts, alerts });
}
