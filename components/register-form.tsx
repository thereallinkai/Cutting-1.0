"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { PasswordField } from "./password-field";

type RegistrationField =
  | "fullName"
  | "gender"
  | "age"
  | "email"
  | "password"
  | "passwordConfirmation"
  | "terms"
  | "privacy";

type RegistrationErrors = Partial<Record<RegistrationField, string>>;

const REGISTRATION_DRAFT_KEY = "lets-go-green-registration-draft";
const LEGACY_REGISTRATION_DRAFT_KEY = "cutting-plan-registration-draft";

export function RegisterForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegistrationErrors>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const current = window.localStorage.getItem(REGISTRATION_DRAFT_KEY);
    const legacy = window.localStorage.getItem(LEGACY_REGISTRATION_DRAFT_KEY);
    const raw = current ?? legacy;
    if (!raw || !formRef.current) return;
    try {
      const draft = JSON.parse(raw) as Record<string, string | boolean>;
      if (!current && legacy) {
        window.localStorage.setItem(REGISTRATION_DRAFT_KEY, legacy);
        window.localStorage.removeItem(LEGACY_REGISTRATION_DRAFT_KEY);
      }
      for (const name of ["fullName", "gender", "age", "email"]) {
        const control = formRef.current.elements.namedItem(name);
        if (
          (control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement) &&
          typeof draft[name] === "string"
        ) {
          control.value = String(draft[name]);
        }
      }
      for (const name of ["terms", "privacy"]) {
        const control = formRef.current.elements.namedItem(name);
        if (
          control instanceof HTMLInputElement &&
          typeof draft[name] === "boolean"
        ) {
          control.checked = Boolean(draft[name]);
        }
      }
    } catch {
      window.localStorage.removeItem(REGISTRATION_DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_REGISTRATION_DRAFT_KEY);
    }
  }, []);

  function saveSafeDraft(formElement: HTMLFormElement) {
    const form = new FormData(formElement);
    window.localStorage.setItem(
      REGISTRATION_DRAFT_KEY,
      JSON.stringify({
        fullName: form.get("fullName") ?? "",
        gender: form.get("gender") ?? "",
        age: form.get("age") ?? "",
        email: form.get("email") ?? "",
        terms: form.get("terms") === "on",
        privacy: form.get("privacy") === "on",
      }),
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    setError("");
    const validationErrors: RegistrationErrors = {};
    const fullName = String(form.get("fullName") ?? "").trim();
    const gender = String(form.get("gender") ?? "");
    const age = Number(form.get("age"));
    const email = String(form.get("email") ?? "").trim();

    if (fullName.length < 2) {
      validationErrors.fullName = "Enter your full name.";
    }
    if (
      !["male", "female", "another_identity", "prefer_not_to_say"].includes(
        gender,
      )
    ) {
      validationErrors.gender = "Choose a gender option.";
    }
    if (!Number.isInteger(age) || age < 13 || age > 120) {
      validationErrors.age = "Age must be a whole number from 13 to 120.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      validationErrors.email = "Enter a valid email address.";
    }
    if (password.length < 10) {
      validationErrors.password = "Use at least 10 characters for your password.";
    }
    if (!confirmation) {
      validationErrors.passwordConfirmation = "Confirm your password.";
    } else if (password !== confirmation) {
      validationErrors.passwordConfirmation = "The passwords do not match.";
    }
    if (form.get("terms") !== "on") {
      validationErrors.terms = "Accept the Terms of Use to continue.";
    }
    if (form.get("privacy") !== "on") {
      validationErrors.privacy = "Accept the Privacy Notice to continue.";
    }

    saveSafeDraft(formElement);

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      if (validationErrors.passwordConfirmation === "The passwords do not match.") {
        formElement
          .querySelector<HTMLInputElement>("#password-confirmation")
          ?.focus();
      } else {
        window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
      }
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          gender: form.get("gender"),
          age: Number(form.get("age")),
          email: form.get("email"),
          password,
          termsAccepted: form.get("terms") === "on",
          privacyAccepted: form.get("privacy") === "on",
        }),
      });
      const result = (await response.json()) as {
        data: { email?: string } | null;
        error: { message: string } | null;
      };
      if (!response.ok || result.error) {
        setError(
          result.error?.message ??
            "We could not create the account. Review the form and try again.",
        );
        return;
      }
      const email = result.data?.email ?? String(form.get("email"));
      router.push(`/onboarding?step=2&email=${encodeURIComponent(email)}`);
    } catch {
      setError("The service is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="form-stack"
      ref={formRef}
      onChange={(event) => {
        saveSafeDraft(event.currentTarget);
        const changedControl = event.target as unknown;
        if (
          !(
            changedControl instanceof HTMLInputElement ||
            changedControl instanceof HTMLSelectElement
          )
        ) {
          return;
        }
        const field = changedControl.name as RegistrationField;
        setError("");
        setFieldErrors((current) => {
          if (!current[field]) return current;
          const next = { ...current };
          delete next[field];
          return next;
        });
      }}
      onSubmit={onSubmit}
      noValidate
    >
      {error || Object.keys(fieldErrors).length > 0 ? (
        <div
          className="message-box error"
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>{error || "Please review your account details."}</strong>
            {Object.keys(fieldErrors).length > 0 ? (
              <ul style={{ margin: ".35rem 0 0", paddingLeft: "1.2rem" }}>
                {Object.values(fieldErrors).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="full-name">Full name</label>
        <input
          id="full-name"
          name="fullName"
          autoComplete="name"
          aria-describedby={
            fieldErrors.fullName ? "full-name-error" : undefined
          }
          aria-invalid={Boolean(fieldErrors.fullName) || undefined}
          required
        />
        {fieldErrors.fullName ? (
          <p className="field-error" id="full-name-error">
            {fieldErrors.fullName}
          </p>
        ) : null}
      </div>
      <div className="form-row">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="gender">Gender</label>
          <select
            id="gender"
            name="gender"
            required
            defaultValue=""
            aria-describedby={fieldErrors.gender ? "gender-error" : undefined}
            aria-invalid={Boolean(fieldErrors.gender) || undefined}
          >
            <option value="" disabled>Select an option</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="another_identity">Another identity</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
          {fieldErrors.gender ? (
            <p className="field-error" id="gender-error">
              {fieldErrors.gender}
            </p>
          ) : null}
        </div>
        <div className="field" style={{ width: 110 }}>
          <label htmlFor="age">Age</label>
          <input
            id="age"
            name="age"
            type="number"
            min="13"
            max="120"
            aria-describedby={fieldErrors.age ? "age-error" : undefined}
            aria-invalid={Boolean(fieldErrors.age) || undefined}
            required
          />
          {fieldErrors.age ? (
            <p className="field-error" id="age-error">
              {fieldErrors.age}
            </p>
          ) : null}
        </div>
      </div>
      <div className="field">
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-describedby={
            fieldErrors.email ? "register-email-error" : undefined
          }
          aria-invalid={Boolean(fieldErrors.email) || undefined}
          required
        />
        {fieldErrors.email ? (
          <p className="field-error" id="register-email-error">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>
      <PasswordField
        id="register-password"
        autoComplete="new-password"
        describedBy={`password-help${fieldErrors.password ? " password-error" : ""}`}
        invalid={Boolean(fieldErrors.password)}
      />
      <p id="password-help" className="field-help">
        Use at least 10 characters with a mix of words or character types.
      </p>
      {fieldErrors.password ? (
        <p className="field-error" id="password-error">
          {fieldErrors.password}
        </p>
      ) : null}
      <PasswordField
        id="password-confirmation"
        label="Confirm password"
        name="passwordConfirmation"
        autoComplete="new-password"
        describedBy={
          fieldErrors.passwordConfirmation
            ? "password-confirmation-error"
            : undefined
        }
        invalid={Boolean(fieldErrors.passwordConfirmation)}
      />
      {fieldErrors.passwordConfirmation ? (
        <p className="field-error" id="password-confirmation-error">
          {fieldErrors.passwordConfirmation}
        </p>
      ) : null}
      <label className="checkbox-row">
        <input
          name="terms"
          type="checkbox"
          aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
          aria-invalid={Boolean(fieldErrors.terms) || undefined}
          required
        />
        <span>
          I accept the <a href="/terms" target="_blank">Terms of Use</a>.
        </span>
      </label>
      {fieldErrors.terms ? (
        <p className="field-error" id="terms-error">
          {fieldErrors.terms}
        </p>
      ) : null}
      <label className="checkbox-row">
        <input
          name="privacy"
          type="checkbox"
          aria-describedby={fieldErrors.privacy ? "privacy-error" : undefined}
          aria-invalid={Boolean(fieldErrors.privacy) || undefined}
          required
        />
        <span>
          I accept the <a href="/privacy" target="_blank">Privacy Notice</a>.
        </span>
      </label>
      {fieldErrors.privacy ? (
        <p className="field-error" id="privacy-error">
          {fieldErrors.privacy}
        </p>
      ) : null}
      <button className="button button-dark form-submit" disabled={pending} type="submit">
        {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : null}
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
