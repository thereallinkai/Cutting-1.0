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

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow, `horizontal overflow: ${context}`).toBeLessThanOrEqual(
    1,
  );
}

async function waitForProductTourController(page: Page) {
  await expect(
    page.locator(
      '[data-product-tour-controller][data-hydrated="true"]',
    ),
  ).toBeAttached();
}

test("public layout is usable and free of high-impact axe violations at required widths", async ({
  page,
}) => {
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoHorizontalOverflow(page, `public page at ${width}px`);
    await expectNoHighImpactViolations(page);
  }
});

test("protected mock pages have no serious or critical axe violations", async ({
  page,
}) => {
  // This test intentionally cold-compiles and scans six routes in CI.
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of [
    "/today",
    "/plan",
    "/calendar",
    "/progress",
    "/profile",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoHighImpactViolations(page);
  }
});

test("Today, Calendar, Profile, and the tutorial reflow at required widths", async ({
  page,
}) => {
  // Sixteen route/viewport combinations plus four axe scans can exceed
  // Playwright's single-test default while the CI development server compiles.
  test.setTimeout(90_000);
  for (const width of [375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/today");
    await expect(
      page.getByRole("heading", { level: 1, name: "Good morning, Jamie." }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, `Today at ${width}px`);

    await page.goto("/calendar");
    await expect(
      page.getByRole("heading", { level: 1, name: "Calendar" }),
    ).toBeVisible();
    await expect(page.locator(".calendar-card")).toBeVisible();
    await expectNoHorizontalOverflow(page, `Calendar at ${width}px`);

    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: "Jamie Rivera" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, `Profile at ${width}px`);

    await waitForProductTourController(page);
    await page.getByRole("link", { name: "Replay tutorial" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".tour-progress span")).toHaveCount(6);
    await expectNoHorizontalOverflow(page, `tutorial at ${width}px`);
    await expectNoHighImpactViolations(page);
    await dialog
      .getByRole("button", { name: "Skip tutorial for now" })
      .click();
  }
});

test("reduced-motion preference removes nonessential page and control motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/today");

  const motion = await page.evaluate(() => {
    const pageTransition = document.querySelector(".page-transition");
    const button = document.querySelector(".button");
    if (
      !(pageTransition instanceof HTMLElement) ||
      !(button instanceof HTMLElement)
    ) {
      throw new Error("Motion test targets were not rendered.");
    }

    const pageStyle = getComputedStyle(pageTransition);
    const buttonStyle = getComputedStyle(button);
    return {
      animationDuration: Number.parseFloat(pageStyle.animationDuration),
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      transitionDuration: Math.max(
        ...buttonStyle.transitionDuration
          .split(",")
          .map((duration) => Number.parseFloat(duration)),
      ),
    };
  });

  expect(motion.animationDuration).toBeLessThan(0.001);
  expect(motion.transitionDuration).toBeLessThan(0.001);
  expect(motion.scrollBehavior).toBe("auto");
});

test("tutorial actions remain reachable in a short mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 420 });
  await page.goto("/profile");
  await waitForProductTourController(page);
  await page.getByRole("link", { name: "Replay tutorial" }).click();

  const dialog = page.getByRole("dialog");
  for (let step = 1; step < 6; step += 1) {
    await dialog.getByRole("button", { name: /Next/ }).click();
  }
  await expect(
    dialog.getByRole("button", { name: /Finish tutorial/ }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page, "tutorial at 375x420");
});
