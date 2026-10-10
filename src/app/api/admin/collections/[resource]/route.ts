import { ok, fail, readJson, revalidateSite } from "../../_lib";
import { isResource, resources } from "../_resources";

type Params = { params: { resource: string } };

export async function GET(req: Request, { params }: Params) {
  if (!isResource(params.resource)) return fail("Unknown resource", 404);
  const q = new URL(req.url).searchParams;
  return ok(await resources[params.resource].list(q));
}

export async function POST(req: Request, { params }: Params) {
  if (!isResource(params.resource)) return fail("Unknown resource", 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid payload");
  try {
    const row = await resources[params.resource].create(body);
    revalidateSite();
    return ok(row, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not create");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  if (!isResource(params.resource)) return fail("Unknown resource", 404);
  const body = await readJson<{ ids?: unknown }>(req);
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return fail("ids required");
  await resources[params.resource].reorder(ids);
  revalidateSite();
  return ok({ reordered: ids.length });
}
