import { ok, fail, readJson, revalidateSite } from "../../../_lib";
import { isResource, resources } from "../../_resources";

type Params = { params: { resource: string; id: string } };

export async function PUT(req: Request, { params }: Params) {
  if (!isResource(params.resource)) return fail("Unknown resource", 404);
  const body = await readJson(req);
  if (!body) return fail("Invalid payload");
  try {
    const row = await resources[params.resource].update(params.id, body);
    revalidateSite();
    return ok(row);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not update");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!isResource(params.resource)) return fail("Unknown resource", 404);
  try {
    await resources[params.resource].remove(params.id);
    revalidateSite();
    return ok({ id: params.id });
  } catch {
    return fail("Could not delete", 404);
  }
}
