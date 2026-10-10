import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { ok, fail } from "../_lib";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("No file uploaded");
  if (file.size > MAX_BYTES) return fail("File too large (max 10 MB)");
  if (!file.type.startsWith("image/")) return fail("Only images are allowed");

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  let ext: string;
  try {
    if (file.type === "image/gif") {
      output = input;
      ext = "gif";
    } else if (file.type === "image/svg+xml") {
      return fail("SVG uploads are not allowed");
    } else {
      output = await sharp(input, { failOn: "none" })
        .rotate()
        .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      ext = "webp";
    }
  } catch {
    return fail("Could not process image");
  }

  const now = new Date();
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const base = path.parse(file.name).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
  const name = `${base}-${Date.now().toString(36)}.${ext}`;

  await mkdir(path.join(UPLOAD_DIR, folder), { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, folder, name), output);

  return ok({ url: `/api/uploads/${folder}/${name}`, name, size: output.byteLength });
}
