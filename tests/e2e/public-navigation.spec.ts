import { expect, test } from "@playwright/test";

test("landing page provides working account and legal navigation", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Plan meals. Notice patterns. Adjust with care.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Public navigation" }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Public navigation" })
    .getByRole("link", { name: "Create account" })
    .click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByRole("heading", { name: "Let's start with you." }),
  ).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Terms of Use" }),
  ).toBeVisible();

  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy Notice" }),
  ).toBeVisible();
});
