import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "approved" | "rejected" | "disabled";

export const asRole = (v: string): UserRole => (v === "admin" ? "admin" : "member");
export const asStatus = (v: string): UserStatus =>
  v === "approved" || v === "rejected" || v === "disabled" ? v : "pending";

/** how often a live session re-reads role/status/shareData from the DB */
const RECHECK_MS = 60_000;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;
        // thrown message becomes `res.error` on the client
        if (user.status !== "approved") throw new Error(asStatus(user.status));
        return { id: user.id, email: user.email, name: user.name ?? user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const now = Date.now();
      const uid = user?.id ?? token.uid;
      if (!uid) return token;
      if (user || !token.chk || now - token.chk > RECHECK_MS) {
        const u = await prisma.user.findUnique({ where: { id: uid }, select: { role: true, status: true, shareData: true, email: true, name: true } });
        token.uid = uid;
        token.role = u ? asRole(u.role) : "member";
        token.status = u ? asStatus(u.status) : "disabled";
        token.share = !!u?.shareData;
        if (u) {
          token.email = u.email;
          token.name = u.name ?? u.email;
        }
        token.chk = now;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
        session.user.role = token.role ?? "member";
        session.user.status = token.status ?? "pending";
        session.user.shareData = !!token.share;
      }
      return session;
    },
  },
};

export const getAdminSession = () => getServerSession(authOptions);

export type SessionUser = { id: string; email: string; name: string; role: UserRole; status: UserStatus; shareData: boolean };

/** Signed-in + approved user, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user;
  if (!u?.id || u.status !== "approved") return null;
  return { id: u.id, email: u.email ?? "", name: u.name ?? u.email ?? "", role: u.role, status: u.status, shareData: u.shareData };
}

/** Signed-in approved admin, or null. */
export async function requireAdmin() {
  const u = await currentUser();
  return u && u.role === "admin" ? u : null;
}
