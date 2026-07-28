"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { PasswordField } from "./password-field";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
    } finally {
      setSent(true);
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="message-box" role="status">
        <CheckCircle2 size={19} aria-hidden="true" />
        <span>
          If an account matches that address, password-reset instructions are on
          the way. In local development, open the captured-email service.
        </span>
      </div>
    );
  }

  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="recovery-email">Email</label>
        <input id="recovery-email" name="email" type="email" autoComplete="email" required />
      </div>
      <button className="button button-dark form-submit" disabled={pending} type="submit">
        {pending ? <LoaderCircle size={18} aria-hidden="true" /> : null}
        {pending ? "Sending…" : "Send reset instructions"}
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmation") ?? "")) {
      setMessage("The passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as {
        data: unknown;
        error: { message: string } | null;
      };
      setMessage(
        response.ok && !result.error
          ? "Your password has been updated. You can now log in."
          : result.error?.message ?? "We could not update the password.",
      );
    } catch {
      setMessage("The service is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={onSubmit}>
      {message ? <div className="message-box" role="status">{message}</div> : null}
      <PasswordField name="password" autoComplete="new-password" />
      <PasswordField
        id="reset-confirmation"
        name="confirmation"
        label="Confirm new password"
        autoComplete="new-password"
      />
      <button className="button button-dark form-submit" disabled={pending} type="submit">
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
