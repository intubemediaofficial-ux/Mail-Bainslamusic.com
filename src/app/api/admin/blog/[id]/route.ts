import { prisma } from "@/lib/db";
import { ok, fail, readJson, revalidateSite } from "../../_lib";
import { postData } from "../_post";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const post = await prisma.blogPost.findUnique({ where: { id: params.id } });
  return post ? ok(post) : fail("Not found", 404);
}

export async function PUT(req: Request, { params }: Params) {
  const body = await readJson(req);
  if (!body) return fail("Invalid payload");
  const existing = await prisma.blogPost.findUnique({ where: { id: params.id } });
  if (!existing) return fail("Not found", 404);
  try {
    const data = postData(body, existing.publishedAt);
    const clash = await prisma.blogPost.findFirst({ where: { slug: data.slug, NOT: { id: params.id } } });
    if (clash) return fail("A post with this slug already exists", 409);
    const post = await prisma.blogPost.update({ where: { id: params.id }, data });
    revalidateSite();
    return ok(post);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not update post");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await prisma.blogPost.delete({ where: { id: params.id } });
    revalidateSite();
    return ok({ id: params.id });
  } catch {
    return fail("Not found", 404);
  }
}
