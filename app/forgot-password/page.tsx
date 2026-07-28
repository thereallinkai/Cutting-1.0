import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/recovery-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div className="auth-card">
        <h1>Reset your password.</h1>
        <p>Enter your email and we&apos;ll send secure reset instructions.</p>
        <ForgotPasswordForm />
        <p className="auth-switch"><Link href="/login">Back to log in</Link></p>
      </div>
    </AuthShell>
  );
}
