import { prisma } from "@/lib/db";
import { ok, fail, readJson, revalidateSite } from "../_lib";
import { postData } from "./_post";

export async function GET() {
  const posts = await prisma.blogPost.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      author: true,
      published: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      coverImage: true,
    },
  });
  return ok(posts);
}

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return fail("Invalid payload");
  try {
    const data = postData(body);
    const clash = await prisma.blogPost.findUnique({ where: { slug: data.slug } });
    if (clash) return fail("A post with this slug already exists", 409);
    const post = await prisma.blogPost.create({ data });
    revalidateSite();
    return ok(post, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not create post");
  }
}
