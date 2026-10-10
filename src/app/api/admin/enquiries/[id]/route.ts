import { prisma } from "@/lib/db";
import { ok, fail, readJson } from "../../_lib";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const body = await readJson<{ read?: unknown }>(req);
  const read = typeof body?.read === "boolean" ? body.read : true;
  try {
    return ok(await prisma.enquiry.update({ where: { id: params.id }, data: { read } }));
  } catch {
    return fail("Not found", 404);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await prisma.enquiry.delete({ where: { id: params.id } });
    return ok({ id: params.id });
  } catch {
    return fail("Not found", 404);
  }
}
