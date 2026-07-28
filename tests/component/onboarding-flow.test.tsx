import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingFlow } from "../../components/onboarding-flow";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function mockBackgroundRequests() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ok: true };
      return { ok: false };
    }),
  );
}

function mealSection(meal: "Breakfast" | "Lunch" | "Dinner") {
  const section = screen.getByRole("heading", { name: meal }).closest("section");
  if (!section) throw new Error(`Could not find ${meal} meal section.`);
  return section as HTMLElement;
}

describe("OnboardingFlow navigation and restoration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    mockBackgroundRequests();
  });

  it("restores a local draft and preserves it across forward and back navigation", async () => {
    window.localStorage.setItem(
      "cutting-plan-onboarding-draft",
      JSON.stringify({
        currentWeight: "82.5",
        targetWeight: "76",
        unit: "kg",
        goalType: "fat_loss",
        targetDate: "2026-12-15",
      }),
    );
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={4} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Current weight")).toHaveValue("82.5");
      expect(screen.getByLabelText("Target weight")).toHaveValue("76");
      expect(screen.getByLabelText("Target date")).toHaveValue("2026-12-15");
    });

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(
      screen.getByRole("heading", { name: "Add context if it helps." }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect(
      screen.getByRole("heading", {
        name: "Set a direction, not a promise.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Current weight")).toHaveValue("82.5");
    expect(screen.getByLabelText("Target weight")).toHaveValue("76");
  });

  it("reviews meal warnings before moving forward and supports going back", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={3} />);

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    const dialog = screen.getByRole("dialog", {
      name: "Review meal balance?",
    });
    expect(dialog).toHaveTextContent(
      "Breakfast is missing carbohydrate and protein.",
    );
    expect(dialog).toHaveTextContent(
      "Lunch is missing carbohydrate, protein and vegetable.",
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Review meals" }),
    );
    expect(
      screen.getByRole("heading", { name: "What works on your plate?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(
      screen.getByRole("button", { name: "Continue anyway" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Set a direction, not a promise.",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect(
      screen.getByRole("heading", { name: "What works on your plate?" }),
    ).toBeInTheDocument();
  });

  it("lets a returning unverified user request a new code without registering again", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return { ok: true };
        }
        return { ok: false };
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={2} />);

    const resend = screen.getByRole("button", { name: "Resend code" });
    expect(resend).toBeDisabled();

    await user.type(
      screen.getByRole("textbox", { name: "Account email" }),
      "returning@example.com",
    );
    expect(resend).toBeEnabled();
    await user.click(resend);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/resend",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "returning@example.com" }),
      }),
    );
    expect(
      screen.getByText(
        "A new verification code was requested. Check the latest email.",
        { selector: "[aria-live]" },
      ),
    ).toBeInTheDocument();
  });
});

describe("OnboardingFlow food preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockBackgroundRequests();
  });

  it("filters foods and supports button and keyboard addition", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={3} />);
    const search = screen.getByRole("textbox", { name: "Search foods" });

    await user.type(search, "rolled oats");
    expect(
      screen.getByRole("heading", { name: "Rolled oats" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "White rice" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Add Rolled oats to breakfast",
      }),
    );
    expect(
      within(mealSection("Breakfast")).getByText("Rolled oats"),
    ).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "eggs");
    const addEggs = screen.getByRole("button", {
      name: "Add Eggs to breakfast",
    });
    addEggs.focus();
    await user.keyboard("{Enter}");
    expect(within(mealSection("Breakfast")).getByText("Eggs")).toBeInTheDocument();
    expect(
      screen.getByText("Eggs added to breakfast.", {
        selector: "[aria-live]",
      }),
    ).toBeInTheDocument();
  });

  it("shows private label foods but prevents adding them to plan preferences", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") return { ok: true };
        if (String(input).endsWith("/api/foods")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                {
                  slug: "my-protein-drink-a1b2c3d4",
                  english_name: "My protein drink",
                  categories: [],
                  plan_eligible: false,
                },
              ],
            }),
          };
        }
        return { ok: false };
      }),
    );
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={3} />);

    expect(
      await screen.findByRole("heading", { name: "My protein drink" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Saved label food — not yet eligible for generated plans.",
      ),
    ).toBeInTheDocument();

    const addToBreakfast = screen.getByRole("button", {
      name: "Add My protein drink to breakfast",
    });
    expect(addToBreakfast).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Add My protein drink to lunch",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Add My protein drink to dinner",
      }),
    ).toBeDisabled();

    await user.click(addToBreakfast);
    expect(
      within(mealSection("Breakfast")).queryByText("My protein drink"),
    ).not.toBeInTheDocument();
  });

  it("supports accessible reordering and removal alternatives", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={3} />);

    await user.click(
      screen.getByRole("button", {
        name: "Add Rolled oats to breakfast",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add Eggs to breakfast" }),
    );
    const breakfast = mealSection("Breakfast");

    await user.click(
      within(breakfast).getByRole("button", { name: "Move Eggs up" }),
    );
    expect(
      screen.getByText("Eggs moved to position 1 in breakfast.", {
        selector: "[aria-live]",
      }),
    ).toBeInTheDocument();
    expect(
      within(breakfast).getByRole("button", { name: "Move Eggs up" }),
    ).toBeDisabled();

    await user.click(
      within(breakfast).getByRole("button", { name: "Remove Eggs" }),
    );
    expect(
      screen.getByText("Eggs removed from breakfast.", {
        selector: "[aria-live]",
      }),
    ).toBeInTheDocument();
    expect(within(breakfast).queryByText("Eggs")).not.toBeInTheDocument();
  });
});
