import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { addLeadsToList, getList, removeLeadsFromList } from "@/lib/intubtool/lists";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

/**
 * body: { ids?: string[]; filter?: string; action; value?: string; fromListId?: string }
 * action: delete | category | unsubscribe | resubscribe | add_to_campaign | add_to_list | remove_from_list | move_to_list
 * add_to_list / move_to_list: value = target list id; move_to_list also needs fromListId; remove_from_list: value = list id
 */
export async function POST(req: Request) {
  const b = await readJson<{ ids?: string[]; filter?: string; action: string; value?: string; fromListId?: string }>(req);
  if (!b?.action) return fail("Invalid payload");
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  let ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string") : [];
  if (!ids.length && typeof b.filter === "string") {
    const rows = await prisma.lead.findMany({ where: leadWhere(new URLSearchParams(b.filter), scope), select: { id: true }, take: 5000 });
    ids = rows.map((r) => r.id);
  }
  if (!ids.length) return fail("No leads selected");
  // explicit ids are re-checked against the scope so a member cannot touch leads they cannot see
  const visible = await prisma.lead.findMany({ where: { AND: [{ id: { in: ids } }, leadWhere(new URLSearchParams(), scope)] }, select: { id: true } });
  ids = visible.map((r) => r.id);
  if (!ids.length) return fail("No leads selected");
  const where = { id: { in: ids } };
  // members may write to shared lists only if they own them; shared (ownerId null) lists are read-only for them
  const editableList = async (id: string) => {
    const list = await getList(scope, id);
    if (!list) return null;
    return scope.admin || list.ownerId === scope.user.id ? list : ("readonly" as const);
  };

  switch (b.action) {
    case "delete": {
      const r = await prisma.lead.deleteMany({ where: scope.admin ? where : { ...where, ownerId: scope.user.id } });
      return ok({ affected: r.count });
    }
    case "category": {
      const r = await prisma.lead.updateMany({ where, data: { category: str(b.value, 200) || null } });
      return ok({ affected: r.count });
    }
    case "unsubscribe":
    case "resubscribe": {
      const r = await prisma.lead.updateMany({ where, data: { unsubscribed: b.action === "unsubscribe" } });
      return ok({ affected: r.count });
    }
    case "add_to_list":
    case "move_to_list": {
      const listId = str(b.value, 100);
      const list = await editableList(listId);
      if (!list) return fail("List not found", 404);
      if (list === "readonly") return fail("Shared lists are read-only — create your own list", 403);
      const added = await addLeadsToList(listId, ids);
      if (b.action === "move_to_list") {
        const from = str(b.fromListId, 100);
        if (from && from !== listId && (await editableList(from)) !== "readonly") await removeLeadsFromList(from, ids);
      }
      return ok({ affected: ids.length, added, alreadyInList: ids.length - added });
    }
    case "remove_from_list": {
      const listId = str(b.value, 100);
      if (!listId) return fail("List id required");
      const list = await editableList(listId);
      if (!list) return fail("List not found", 404);
      if (list === "readonly") return fail("Shared lists are read-only", 403);
      const removed = await removeLeadsFromList(listId, ids);
      return ok({ affected: removed });
    }
    case "add_to_campaign": {
      const campaignId = str(b.value, 100);
      const c = await prisma.campaign.findFirst({ where: campaignWhere(scope, campaignId) });
      if (!c) return fail("Campaign not found", 404);
      const eligible = await prisma.lead.findMany({ where: { ...where, email: { not: null }, unsubscribed: false }, select: { id: true } });
      let added = 0;
      for (const l of eligible) {
        const r = await prisma.campaignLead.upsert({ where: { campaignId_leadId: { campaignId, leadId: l.id } }, update: {}, create: { campaignId, leadId: l.id, nextSendAt: new Date() } });
        if (r) added++;
      }
      return ok({ affected: added, skippedNoEmail: ids.length - eligible.length });
    }
    default:
      return fail("Unknown action");
  }
}
