import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/recovery-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <div className="auth-card">
        <h1>Choose a new password.</h1>
        <p>Use at least 10 characters and avoid a password used elsewhere.</p>
        <ResetPasswordForm />
        <p className="auth-switch"><Link href="/login">Back to log in</Link></p>
      </div>
    </AuthShell>
  );
}
