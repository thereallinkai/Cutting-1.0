import { expect, test } from "@playwright/test";

test("development Today check-in sends the desired final state", async ({
  page,
}) => {
  let submittedState: unknown;
  await page.route("**/api/checkins/*", async (route) => {
    submittedState = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { saved: true }, error: null }),
    });
  });

  await page.goto("/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "Good morning, Jamie." }),
  ).toBeVisible();
  const dinnerRow = page.locator(".meal-row").filter({ hasText: "Dinner" });
  const completionButton = dinnerRow.getByRole("button", {
    name: "Mark completed",
  });
  await expect(completionButton).toHaveAttribute("aria-pressed", "false");
  await page.waitForLoadState("networkidle");

  await completionButton.click();
  const completedButton = dinnerRow.getByRole("button", {
    name: "Completed",
  });
  await expect(completedButton).toHaveAttribute("aria-pressed", "true");
  expect(submittedState).toEqual({
    kind: "meal_status",
    mealType: "dinner",
    status: "completed",
    skipReason: null,
  });
});

test("mock Plan generation preserves the accepted version until review", async ({
  page,
}) => {
  let acceptedPlanId: string | null = null;
  await page.route("**/api/plans/generate", async (route) => {
    const body = route.request().postDataJSON() as {
      idempotencyKey?: string;
    };
    expect(body.idempotencyKey).toBeTruthy();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { status: "draft", planId: "mock-plan-draft" },
        error: null,
      }),
    });
  });
  await page.route("**/api/plans/*/accept", async (route) => {
    acceptedPlanId = route.request().url().split("/").at(-2) ?? null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { planId: acceptedPlanId, status: "accepted" },
        error: null,
      }),
    });
  });

  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { level: 1, name: "My Plan" }),
  ).toBeVisible();
  await expect(page.getByText("Plan version 2 · Accepted July 20")).toBeVisible();

  const generateButton = page.getByRole("button", {
    name: "Generate new draft",
  });
  await page.waitForLoadState("networkidle");
  await generateButton.click();
  await expect(
    page.getByText(
      "A new draft is ready for review. Version 2 remains accepted until you explicitly replace it.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep accepted plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept this version" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept this version" }).click();
  await expect(
    page.locator("[aria-live]").filter({
      hasText: "Draft accepted as the current plan.",
    }),
  ).toHaveCount(1);
  expect(acceptedPlanId).toBe("mock-plan-draft");
});

test("mobile primary navigation reaches protected plan pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/today");

  const mobileNavigation = page.locator("nav.mobile-nav");
  await expect(mobileNavigation).toBeVisible();
  await expect(page.locator("aside.sidebar")).toBeHidden();
  await mobileNavigation.getByRole("link", { name: "My Plan" }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "My Plan" }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "My Plan" }),
  ).toHaveAttribute("aria-current", "page");
});
