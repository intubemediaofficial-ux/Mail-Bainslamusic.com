import type { DefaultSession } from "next-auth";
import type { UserRole, UserStatus } from "@/lib/auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; role: UserRole; status: UserStatus; shareData: boolean };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: UserRole;
    status?: UserStatus;
    share?: boolean;
    /** last DB re-check (ms) */
    chk?: number;
  }
}
