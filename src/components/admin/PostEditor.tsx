"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Save, Trash2 } from "lucide-react";
import type { BlogPost } from "@prisma/client";
import RichTextEditor from "./RichTextEditor";
import ImagePicker from "./ImagePicker";
import { Button, Card, Field, Input, Textarea, Toggle, api, slugify, useToast } from "./ui";
import { toDraft, type PostDraft } from "@/lib/postDraft";

export default function PostEditor({ id, initial, categories }: { id?: string; initial: PostDraft; categories: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<PostDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.slug);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<PostDraft>) => setD((s) => ({ ...s, ...patch }));

  async function save(publishedOverride?: boolean) {
    setSaving(true);
    const payload = {
      ...d,
      published: publishedOverride ?? d.published,
      publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : "",
    };
    try {
      if (id) {
        const post = await api<BlogPost>(`/api/admin/blog/${id}`, { method: "PUT", body: JSON.stringify(payload) });
        setD(toDraft(post));
        toast.success(post.published ? "Post published" : "Draft saved");
        router.refresh();
      } else {
        const post = await api<BlogPost>("/api/admin/blog", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Post created");
        router.replace(`/admin/blog/${post.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || !confirm("Delete this post permanently?")) return;
    try {
      await api(`/api/admin/blog/${id}`, { method: "DELETE" });
      router.push("/admin/blog");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/admin/blog" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> All posts
        </Link>
        <div className="flex flex-wrap gap-2">
          {id && d.published && d.slug && (
            <a href={`/blog/${d.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              <Eye className="h-4 w-4" /> View
            </a>
          )}
          {id && (
            <Button type="button" variant="danger" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          {d.published ? (
            <Button type="button" variant="secondary" loading={saving} onClick={() => save(false)}>
              Unpublish
            </Button>
          ) : (
            <Button type="button" variant="secondary" loading={saving} onClick={() => save(false)}>
              <Save className="h-4 w-4" /> Save draft
            </Button>
          )}
          <Button type="button" loading={saving} onClick={() => save(true)}>
            {d.published ? "Update" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Input
            required
            value={d.title}
            onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
            placeholder="Post title"
            className="!rounded-xl !px-4 !py-3 !text-2xl font-bold"
          />
          <RichTextEditor value={d.content} onChange={(content) => set({ content })} placeholder="Write your article here…" />
          <Card className="space-y-5 p-5">
            <h3 className="font-semibold text-white">SEO</h3>
            <Field label="Meta title" hint={`${d.metaTitle.length}/60 — leave empty to use the post title`}>
              <Input value={d.metaTitle} onChange={(e) => set({ metaTitle: e.target.value })} />
            </Field>
            <Field label="Meta description" hint={`${d.metaDesc.length}/160 — leave empty to use the excerpt`}>
              <Textarea value={d.metaDesc} onChange={(e) => set({ metaDesc: e.target.value })} className="!min-h-[80px]" />
            </Field>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="space-y-5 p-5">
            <Toggle checked={d.published} onChange={(published) => set({ published })} label={d.published ? "Published" : "Draft"} />
            <Field label="Publish date" hint="Leave empty to use the time you publish">
              <Input type="datetime-local" value={d.publishedAt} onChange={(e) => set({ publishedAt: e.target.value })} />
            </Field>
            <Field label="Slug" hint={`/blog/${d.slug || "…"}`}>
              <Input
                value={d.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set({ slug: slugify(e.target.value) });
                }}
              />
            </Field>
            <Field label="Author">
              <Input value={d.author} onChange={(e) => set({ author: e.target.value })} />
            </Field>
          </Card>

          <Card className="space-y-5 p-5">
            <Field label="Cover image">
              <ImagePicker value={d.coverImage} onChange={(coverImage) => set({ coverImage })} />
            </Field>
            <Field label="Excerpt" hint="Short summary shown in the blog list">
              <Textarea value={d.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
            </Field>
            <Field label="Category">
              <Input list="post-categories" value={d.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. YouTube" />
              <datalist id="post-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Tags" hint="Comma separated">
              <Input value={d.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="music, distribution" />
            </Field>
          </Card>
        </aside>
      </div>
      {toast.toast}
    </form>
  );
}
