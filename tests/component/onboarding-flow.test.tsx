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

function completionDraft(overrides: Record<string, unknown> = {}) {
  return {
    meals: {
      breakfast: ["rolled-oats"],
      lunch: ["chicken-breast"],
      dinner: ["broccoli"],
    },
    currentWeight: "210",
    targetWeight: "200",
    unit: "lb",
    goalType: "fat_loss",
    targetDate: "2026-08-31",
    height: "",
    activity: "high",
    trainingDays: "3",
    restrictions: "",
    allergies: "",
    timeZone: "America/New_York",
    safety: [],
    notes: "",
    acknowledgedWarnings: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockCompletionRequests(options?: {
  putResponse?: Response;
  foods?: Array<{
    slug: string;
    english_name: string;
    categories: string[];
    plan_eligible: boolean;
  }>;
}) {
  const foods = options?.foods ?? [
    {
      slug: "rolled-oats",
      english_name: "Rolled oats",
      categories: ["Carbohydrate", "Protein"],
      plan_eligible: true,
    },
    {
      slug: "chicken-breast",
      english_name: "Chicken breast",
      categories: ["Protein"],
      plan_eligible: true,
    },
    {
      slug: "broccoli",
      english_name: "Broccoli",
      categories: ["Vegetable"],
      plan_eligible: true,
    },
  ];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/onboarding") && init?.method === "PUT") {
        return options?.putResponse
          ?? jsonResponse({ data: { completed: true, goalId: "goal-1" }, error: null });
      }
      if (url.endsWith("/api/onboarding") && init?.method === "PATCH") {
        return jsonResponse({ data: { saved: true }, error: null });
      }
      if (url.endsWith("/api/onboarding")) {
        return jsonResponse({
          data: { currentStep: null, draft: null },
          error: null,
        });
      }
      if (url.endsWith("/api/foods")) {
        return jsonResponse({ data: foods, error: null });
      }
      return jsonResponse({ data: null, error: { code: "NOT_FOUND", message: "Not found." } }, 404);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

describe("OnboardingFlow completion", () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  it("shows a safe API error message when final profile persistence fails", async () => {
    window.localStorage.setItem(
      "cutting-plan-onboarding-draft",
      JSON.stringify(completionDraft()),
    );
    const safeMessage =
      "One or more selected foods are no longer available.";
    mockCompletionRequests({
      putResponse: jsonResponse(
        {
          data: null,
          error: {
            code: "FOOD_SELECTION_CHANGED",
            message: safeMessage,
          },
        },
        409,
      ),
    });
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={6} />);

    await screen.findByText("fat loss · 210 lb → 200 lb · 2026-08-31");
    await user.click(
      screen.getByRole("checkbox", {
        name: "I have reviewed this information and want to complete onboarding.",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /Generate my plan/ }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Review your meal selections.");
    expect(alert).toHaveTextContent(safeMessage);
    expect(alert).toHaveTextContent(
      "Choose Edit under Meals, review the foods, and try again.",
    );
    expect(
      screen.queryByText(
        "We could not save the final step. Your information is still here; please try again.",
      ),
    ).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalledWith("/plan");
  });

  it("conveys an imperial height through successful Step 6 completion", async () => {
    window.localStorage.setItem(
      "cutting-plan-onboarding-draft",
      JSON.stringify(completionDraft({ height: "5 ft 10 in" })),
    );
    const fetchMock = mockCompletionRequests();
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={6} />);

    await screen.findByText("fat loss · 210 lb → 200 lb · 2026-08-31");
    await user.click(
      screen.getByRole("checkbox", {
        name: "I have reviewed this information and want to complete onboarding.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Go to Today" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/today"));
    const putCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/onboarding") && init?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        height: "5 ft 10 in",
        unit: "lb",
        currentWeightKg: expect.closeTo(95.254, 3),
        targetWeightKg: expect.closeTo(90.718, 3),
      }),
    );
  });

  it("normalizes a restored legacy vegetable powder slug before completion", async () => {
    window.localStorage.setItem(
      "cutting-plan-onboarding-draft",
      JSON.stringify(
        completionDraft({
          meals: {
            breakfast: ["rolled-oats"],
            lunch: ["chicken-breast"],
            dinner: ["vegetable-vitamin-powder"],
          },
        }),
      ),
    );
    const fetchMock = mockCompletionRequests({
      foods: [
        {
          slug: "rolled-oats",
          english_name: "Rolled oats",
          categories: ["Carbohydrate", "Protein"],
          plan_eligible: true,
        },
        {
          slug: "chicken-breast",
          english_name: "Chicken breast",
          categories: ["Protein"],
          plan_eligible: true,
        },
        {
          slug: "vegetable-or-vitamin-powder",
          english_name: "Vegetable or vitamin powder",
          categories: ["Supplement"],
          plan_eligible: true,
        },
      ],
    });
    const user = userEvent.setup();
    render(<OnboardingFlow initialStep={6} />);

    await screen.findByText("fat loss · 210 lb → 200 lb · 2026-08-31");
    await user.click(
      screen.getByRole("checkbox", {
        name: "I have reviewed this information and want to complete onboarding.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Go to Today" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/today"));
    const putCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/onboarding") && init?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall?.[1]?.body)).meals.dinner).toEqual([
      "vegetable-or-vitamin-powder",
    ]);
  });
});
