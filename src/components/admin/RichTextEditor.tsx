"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Link as LinkIcon,
  Unlink,
  ImagePlus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Eraser,
  Code2,
  Loader2,
} from "lucide-react";
import { uploadImage } from "./ImagePicker";

function ToolbarButton({ onClick, active, disabled, title, children }: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`rounded-md p-1.5 transition disabled:opacity-30 ${active ? "bg-fuchsia-600/30 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-white/10" />;

export default function RichTextEditor({ value, onChange, placeholder = "Start writing…" }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [html, setHtml] = useState(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "tiptap" },
      handleDrop: (_view, event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith("image/")) {
          event.preventDefault();
          void insertImage(file);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (file) {
          event.preventDefault();
          void insertImage(file);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      setHtml(next);
      onChange(next);
    },
  });

  useEffect(() => {
    if (editor && !showHtml && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
      setHtml(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  async function insertImage(file: File) {
    if (!editor) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name.replace(/\.[^.]+$/, "") }).run();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function toggleHtml() {
    if (!editor) return;
    if (showHtml) {
      editor.commands.setContent(html, true);
      onChange(editor.getHTML());
    } else {
      setHtml(editor.getHTML());
    }
    setShowHtml((v) => !v);
  }

  if (!editor) {
    return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/40">Loading editor…</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] focus-within:border-fuchsia-500/60">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-white/10 bg-black/30 px-2 py-1.5">
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo() || showHtml}>
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo() || showHtml}>
          <Redo className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Heading 1" active={editor.isActive("heading", { level: 1 })} disabled={showHtml} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Heading 2" active={editor.isActive("heading", { level: 2 })} disabled={showHtml} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Heading 3" active={editor.isActive("heading", { level: 3 })} disabled={showHtml} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Bold" active={editor.isActive("bold")} disabled={showHtml} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} disabled={showHtml} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive("underline")} disabled={showHtml} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough" active={editor.isActive("strike")} disabled={showHtml} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Inline code" active={editor.isActive("code")} disabled={showHtml} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Align left" active={editor.isActive({ textAlign: "left" })} disabled={showHtml} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Align center" active={editor.isActive({ textAlign: "center" })} disabled={showHtml} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Align right" active={editor.isActive({ textAlign: "right" })} disabled={showHtml} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} disabled={showHtml} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} disabled={showHtml} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Quote" active={editor.isActive("blockquote")} disabled={showHtml} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Code block" active={editor.isActive("codeBlock")} disabled={showHtml} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Horizontal rule" disabled={showHtml} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton title="Add link" active={editor.isActive("link")} disabled={showHtml} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Remove link" disabled={!editor.isActive("link") || showHtml} onClick={() => editor.chain().focus().unsetLink().run()}>
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Insert image" disabled={uploading || showHtml} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </ToolbarButton>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])} />
        <Divider />
        <ToolbarButton title="Clear formatting" disabled={showHtml} onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          <Eraser className="h-4 w-4" />
        </ToolbarButton>
        <span className="flex-1" />
        <button
          type="button"
          onClick={toggleHtml}
          className={`rounded-md px-2 py-1 text-xs font-semibold ${showHtml ? "bg-fuchsia-600/30 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
        >
          {showHtml ? "Visual" : "HTML"}
        </button>
      </div>

      {showHtml ? (
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          spellCheck={false}
          className="min-h-[380px] w-full bg-black/40 px-5 py-4 font-mono text-xs leading-relaxed text-white/85 outline-none"
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
