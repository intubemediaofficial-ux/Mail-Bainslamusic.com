import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBlogCategories, getSettings } from "@/lib/content";
import PostEditor from "@/components/admin/PostEditor";
import { toDraft } from "@/lib/postDraft";

export const metadata = { title: "New post" };

export default async function NewPostPage() {
  const [session, s, categories] = await Promise.all([getServerSession(authOptions), getSettings(), getBlogCategories()]);
  return <PostEditor initial={toDraft(null, session?.user?.name || s.company_name)} categories={categories} />;
}
