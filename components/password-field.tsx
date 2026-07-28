"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  id?: string;
  label?: string;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  describedBy?: string;
  invalid?: boolean;
};

export function PasswordField({
  id,
  label = "Password",
  name = "password",
  autoComplete = "current-password",
  required = true,
  minLength = 10,
  describedBy,
  invalid = false,
}: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-wrap">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
        <button
          className="icon-button"
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
