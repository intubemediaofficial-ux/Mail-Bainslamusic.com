import type { Metadata } from "next";
import AuthCard from "../AuthCard";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "Create account · Bainsla Mail Tool", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function ToolSignupPage() {
  return (
    <AuthCard title="Create your account" subtitle="An admin approves new accounts before first sign-in.">
      <SignupForm />
    </AuthCard>
  );
}
