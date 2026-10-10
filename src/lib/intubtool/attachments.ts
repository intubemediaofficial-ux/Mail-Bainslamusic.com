import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";

export type Attachment = { name: string; path: string; size: number; type: string };

export const ATTACHMENT_DIR = path.join(process.cwd(), "uploads", "intubtool", "attachments");
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Gmail rejects messages over 25 MB; keep headroom for MIME overhead. */
export const MAX_STEP_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_STEP = 5;

const ALLOWED_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".rtf",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".mp3", ".mp4",
]);
const BLOCKED_EXT = new Set([".exe", ".js", ".bat", ".cmd", ".sh", ".msi", ".scr", ".vbs", ".jar", ".com", ".ps1", ".html", ".htm", ".svg"]);

const relPattern = /^\d{4}\/\d{2}\/[a-z0-9-]+-[a-z0-9]+\.[a-z0-9]{2,5}$/;

export function safeAttachmentPath(rel: string) {
  if (!relPattern.test(rel)) return null;
  const abs = path.join(ATTACHMENT_DIR, rel);
  return abs.startsWith(ATTACHMENT_DIR + path.sep) ? abs : null;
}

export function attachmentExtError(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (BLOCKED_EXT.has(ext)) return `${ext} files are blocked by Gmail`;
  if (!ALLOWED_EXT.has(ext)) return `Unsupported file type ${ext || "(none)"} — use PDF, Office, image, CSV, TXT, ZIP, MP3 or MP4`;
  return null;
}

export async function saveAttachment(file: File): Promise<Attachment> {
  const ext = path.extname(file.name).toLowerCase();
  const now = new Date();
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const base = path.parse(file.name).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "file";
  const rel = `${folder}/${base}-${Date.now().toString(36)}${ext}`;
  const abs = path.join(ATTACHMENT_DIR, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(await file.arrayBuffer()));
  return { name: file.name.slice(0, 120), path: rel, size: file.size, type: file.type || "application/octet-stream" };
}

export function parseAttachments(v: unknown): Attachment[] {
  const raw = typeof v === "string" ? (() => { try { return JSON.parse(v) as unknown; } catch { return []; } })() : v;
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  let total = 0;
  for (const a of raw as Partial<Attachment>[]) {
    if (!a || typeof a.path !== "string" || !safeAttachmentPath(a.path)) continue;
    const size = typeof a.size === "number" && Number.isFinite(a.size) ? Math.max(0, Math.trunc(a.size)) : 0;
    if (out.length >= MAX_ATTACHMENTS_PER_STEP || total + size > MAX_STEP_ATTACHMENT_BYTES) break;
    total += size;
    out.push({
      name: (typeof a.name === "string" && a.name.trim().slice(0, 120)) || path.basename(a.path),
      path: a.path,
      size,
      type: (typeof a.type === "string" && a.type.slice(0, 100)) || "application/octet-stream",
    });
  }
  return out;
}

/** nodemailer attachment list; silently drops files that no longer exist on disk. */
export async function mailAttachments(json: string | null | undefined) {
  const list = parseAttachments(json);
  const out: { filename: string; path: string; contentType: string }[] = [];
  for (const a of list) {
    const abs = safeAttachmentPath(a.path);
    if (!abs) continue;
    if (await stat(abs).then((s) => s.isFile()).catch(() => false)) out.push({ filename: a.name, path: abs, contentType: a.type });
  }
  return out;
}
