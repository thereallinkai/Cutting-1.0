import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell>
      <div className="auth-card">
        <p className="eyebrow">Step 1 of 6</p>
        <h1>Let&apos;s start with you.</h1>
        <p>You can pause after email verification and return at any time.</p>
        <RegisterForm />
        <p className="auth-switch">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
