import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PasswordField } from "../../components/password-field";
import { RegisterForm } from "../../components/register-form";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

describe("authentication forms", () => {
  it("toggles password visibility without changing the field value", async () => {
    const user = userEvent.setup();
    render(<PasswordField />);
    const password = screen.getByLabelText("Password");

    await user.type(password, "correct horse battery staple");
    expect(password).toHaveAttribute("type", "password");

    const show = screen.getByRole("button", { name: "Show password" });
    await user.click(show);
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("correct horse battery staple");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("blocks mismatched registration passwords and focuses confirmation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Password"), "a secure password");
    const confirmation = screen.getByLabelText("Confirm password");
    await user.type(confirmation, "a different password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The passwords do not match.",
    );
    expect(confirmation).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("summarizes and associates invalid registration fields before submission", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Please review your account details.");
    expect(alert).toHaveTextContent("Enter your full name.");
    expect(alert).toHaveTextContent("Enter a valid email address.");
    expect(screen.getByLabelText("Full name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter a valid email address.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
