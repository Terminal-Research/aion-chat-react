import { expect, test, type Locator, type Page } from "@playwright/test";

async function openAgent(page: Page, options = "") {
  await page.goto(`/tests/browser/fixture/index.html?${options}`);
  await page.getByRole("button", {
    name: "Available agent Aion agent", exact: true,
  }).click();
}

async function finishHistoryLoad(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("load-history")));
  await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();
}

async function expectBottom(transcript: Locator) {
  await expect.poll(() => transcript.evaluate((element) =>
    element.scrollHeight - element.scrollTop - element.clientHeight,
  )).toBeLessThanOrEqual(2);
}

test("opens restored threads at the bottom through layout changes without overriding manual scrolling", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openAgent(page, "long-history&deferred-history");
  const rows = page.locator(".aion-chat__conversation-select");
  await rows.first().click();
  await expect(page.getByRole("textbox", { name: "Chat message" })).toHaveCount(0);
  await finishHistoryLoad(page);
  const transcript = page.getByRole("log");
  await expectBottom(transcript);

  // Model media or a custom renderer gaining height after history has mounted.
  const lastEntry = transcript.locator(".aion-chat__transcript-entry").last();
  await lastEntry.evaluate((element) => { element.style.paddingBottom = "500px"; });
  await expectBottom(transcript);
  await page.getByRole("textbox", { name: "Chat message" })
    .fill("A multiline draft\nwith enough lines\nto resize\nthe composer\nwhile pinned.");
  await expectBottom(transcript);
  await transcript.hover();
  await page.mouse.wheel(0, -500);
  await expect(page.getByRole("button", { name: "Scroll to latest message" }))
    .toBeVisible();
  const previousTop = await transcript.evaluate((element) => element.scrollTop);
  await lastEntry.evaluate((element) => { element.style.paddingBottom = "1000px"; });
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));
  expect(await transcript.evaluate((element) => element.scrollTop))
    .toBe(previousTop);

  await rows.nth(1).click();
  await finishHistoryLoad(page);
  await expectBottom(transcript);
  await page.getByRole("button", { name: /^available-context-01 prompt/u }).click();
  await finishHistoryLoad(page);
  await expectBottom(transcript);
  expect(errors).toEqual([]);
});

for (const device of [
  { name: "desktop", viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false },
  { name: "touch", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
]) {
  test.describe(`${device.name} thread selection focus`, () => {
    test.use({ viewport: device.viewport, hasTouch: device.hasTouch, isMobile: device.isMobile });
    test("handles new threads and asynchronous history without moving the page", async ({ page }) => {
      await openAgent(page, "deferred-history&long-history");
      const composer = page.getByRole("textbox", { name: "Chat message" });
      const checkFocus = async () => {
        await expect(composer).toBeVisible();
        if (device.hasTouch) await expect(composer).not.toBeFocused();
        else await expect(composer).toBeFocused();
      };
      await page.getByRole("button", { name: "New thread", exact: true }).click();
      await checkFocus();
      await page.locator(".aion-chat__conversation-select").nth(1).click();
      const pageTop = await page.evaluate(() => window.scrollY);
      await finishHistoryLoad(page);
      await checkFocus();
      await expectBottom(page.getByRole("log"));
      expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
      await page.getByRole("button", { name: "New thread", exact: true }).click();
      await checkFocus();
    });
  });
}
