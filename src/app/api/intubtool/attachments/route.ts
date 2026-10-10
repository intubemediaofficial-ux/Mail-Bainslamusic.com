import { ok, fail } from "@/app/api/admin/_lib";
import { attachmentExtError, MAX_ATTACHMENT_BYTES, saveAttachment } from "@/lib/intubtool/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uploads one file to be attached to campaign emails; returns the descriptor stored on `CampaignStep.attachments`. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("No file uploaded");
  if (file.size === 0) return fail("File is empty");
  if (file.size > MAX_ATTACHMENT_BYTES) return fail(`File too large (max ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB)`);
  const extError = attachmentExtError(file.name);
  if (extError) return fail(extError);
  return ok(await saveAttachment(file), 201);
}
