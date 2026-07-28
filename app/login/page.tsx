import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell>
      <div className="auth-card">
        <h1>Welcome back.</h1>
        <p>Continue with today&apos;s meals and the patterns you&apos;re building.</p>
        <LoginForm />
        <p className="auth-switch">
          New to Cutting Plan? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </AuthShell>
  );
}
