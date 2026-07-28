"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { PasswordField } from "./password-field";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as {
        data: { redirectTo?: string } | null;
        error: { message: string } | null;
      };
      if (!response.ok || result.error) {
        setError(
          result.error?.message ??
            "We could not log you in. Check your details and try again.",
        );
        return;
      }
      router.replace(result.data?.redirectTo ?? "/today");
      router.refresh();
    } catch {
      setError("The service is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate>
      {error ? (
        <div className="message-box error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <PasswordField />
      <div className="form-row">
        <Link href="/onboarding?step=2">Continue email verification</Link>
        <Link href="/forgot-password">Forgot password?</Link>
      </div>
      <button className="button button-dark form-submit" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : null}
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
