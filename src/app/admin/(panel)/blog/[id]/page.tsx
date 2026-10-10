import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getBlogCategories } from "@/lib/content";
import PostEditor from "@/components/admin/PostEditor";
import { toDraft } from "@/lib/postDraft";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: { id: string } }) {
  const [post, categories] = await Promise.all([prisma.blogPost.findUnique({ where: { id: params.id } }), getBlogCategories()]);
  if (!post) notFound();
  return <PostEditor id={post.id} initial={toDraft(post)} categories={categories} />;
}
