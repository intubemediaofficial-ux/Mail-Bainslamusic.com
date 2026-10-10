import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// public endpoints inside the tool (open-tracking pixel + unsubscribe links in emails, signup)
const PUBLIC_PREFIXES = ["/api/intubtool/t/", "/api/intubtool/u/", "/api/intubtool/bt/", "/api/intubtool/bc/", "/api/intubtool/bu/", "/api/intubtool/auth/"];
const PUBLIC_PAGES = ["/login", "/signup"];
// Mail tool pages live in app/intubtool but are served from clean URLs (/campaigns, /inbox, ...)
const TOOL_SECTIONS = ["inbox", "search", "leads", "saved-searches", "campaigns", "meetings", "multi-send", "users", "settings", "login", "signup"];

const isToolPage = (p: string) => p === "/" || TOOL_SECTIONS.includes(p.split("/")[1]);

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/intubtool" || pathname.startsWith("/intubtool/")) {
    return NextResponse.redirect(new URL((pathname.slice("/intubtool".length) || "/") + search, req.url), 308);
  }
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const tool = isToolPage(pathname);
  const serve = () => (tool ? NextResponse.rewrite(new URL(`/intubtool${pathname === "/" ? "" : pathname}${search}`, req.url)) : NextResponse.next());

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const approved = !!token && token.status === "approved";
  const admin = approved && token.role === "admin";
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC_PAGES.includes(pathname) || pathname === "/admin/login") {
    if (approved) {
      const cb = req.nextUrl.searchParams.get("callbackUrl");
      const target = cb && /^\/(?![/\\])/.test(cb) ? cb : admin && pathname === "/admin/login" ? "/admin" : "/";
      return NextResponse.redirect(new URL(target, req.url));
    }
    return serve();
  }

  if (isApi) {
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!approved) return NextResponse.json({ ok: false, error: "Account not approved" }, { status: 403 });
    if (pathname.startsWith("/api/admin") && !admin) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    return NextResponse.next();
  }

  if (!token) {
    const url = new URL(tool ? "/login" : "/admin/login", req.url);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }
  if (!approved) {
    const url = new URL("/login", req.url);
    url.searchParams.set("status", typeof token.status === "string" ? token.status : "pending");
    return NextResponse.redirect(url);
  }
  // website CMS (/admin) is admin-only; members live in the mail tool
  if (!tool && !admin) return NextResponse.redirect(new URL("/", req.url));
  return serve();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/api/admin/:path*",
    "/intubtool/:path*",
    "/api/intubtool/:path*",
    "/inbox/:path*",
    "/search/:path*",
    "/leads/:path*",
    "/saved-searches/:path*",
    "/campaigns/:path*",
    "/meetings/:path*",
    "/multi-send/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/login/:path*",
    "/signup/:path*",
  ],
};
