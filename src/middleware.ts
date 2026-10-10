import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// public endpoints inside the tool (open-tracking pixel + unsubscribe links in emails, signup)
const PUBLIC_PREFIXES = ["/api/intubtool/t/", "/api/intubtool/u/", "/api/intubtool/bt/", "/api/intubtool/bc/", "/api/intubtool/bu/", "/api/intubtool/auth/"];
const PUBLIC_PAGES = ["/intubtool/login", "/intubtool/signup"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const approved = !!token && token.status === "approved";
  const admin = approved && token.role === "admin";
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC_PAGES.includes(pathname) || pathname === "/admin/login") {
    if (approved) {
      const cb = req.nextUrl.searchParams.get("callbackUrl");
      const target = cb && /^\/(admin|intubtool)(\/|$)/.test(cb) ? cb : admin && pathname === "/admin/login" ? "/admin" : "/intubtool";
      return NextResponse.redirect(new URL(target, req.url));
    }
    return NextResponse.next();
  }

  if (isApi) {
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!approved) return NextResponse.json({ ok: false, error: "Account not approved" }, { status: 403 });
    if (pathname.startsWith("/api/admin") && !admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    return NextResponse.next();
  }

  const tool = pathname.startsWith("/intubtool");
  if (!token) {
    const url = new URL(tool ? "/intubtool/login" : "/admin/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (!approved) {
    const url = new URL("/intubtool/login", req.url);
    url.searchParams.set("status", typeof token.status === "string" ? token.status : "pending");
    return NextResponse.redirect(url);
  }
  // website CMS (/admin) is admin-only; members live in /intubtool
  if (!tool && !admin) return NextResponse.redirect(new URL("/intubtool", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/intubtool/:path*", "/api/intubtool/:path*"],
};
