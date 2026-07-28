import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHighImpactViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const highImpactViolations = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );

  expect(
    highImpactViolations,
    highImpactViolations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`,
      )
      .join("\n"),
  ).toEqual([]);
}

test("public layout is usable and free of high-impact axe violations at required widths", async ({
  page,
}) => {
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(horizontalOverflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    await expectNoHighImpactViolations(page);
  }
});

test("protected mock pages have no serious or critical axe violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ["/today", "/plan", "/calendar", "/progress", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoHighImpactViolations(page);
  }
});
