"use client";

import { useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import { KeyRound, Save } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, api, useToast } from "@/components/admin/ui";

export default function AccountForm({ name: initialName, email: initialEmail }: { name: string; email: string }) {
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/admin/account", { method: "PUT", body: JSON.stringify({ name, email }) });
      toast.success(email !== initialEmail ? "Saved — please sign in again with your new email" : "Profile saved");
      if (email !== initialEmail) setTimeout(() => signOut({ callbackUrl: "/admin/login" }), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) return toast.error("Passwords do not match");
    setSaving(true);
    try {
      await api("/api/admin/account", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) });
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Account" description="Your admin login details." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <form onSubmit={saveProfile} className="space-y-5">
            <h2 className="font-semibold text-white">Profile</h2>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Login email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> Save profile
            </Button>
          </form>
        </Card>
        <Card className="p-6">
          <form onSubmit={savePassword} className="space-y-5">
            <h2 className="font-semibold text-white">Change password</h2>
            <Field label="Current password">
              <Input type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="New password" hint="At least 8 characters">
              <Input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label="Confirm new password">
              <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button type="submit" loading={saving}>
              <KeyRound className="h-4 w-4" /> Change password
            </Button>
          </form>
        </Card>
      </div>
      {toast.toast}
    </div>
  );
}
