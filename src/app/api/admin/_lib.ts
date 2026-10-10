import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const ok = <T>(data: T, status = 200) => NextResponse.json({ ok: true, data }, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const bool = (v: unknown, fallback = true) => (typeof v === "boolean" ? v : fallback);
export const int = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback);

export const revalidateSite = () => revalidatePath("/", "layout");
