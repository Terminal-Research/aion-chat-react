import { expect, test, type Page } from "@playwright/test";

async function openPreviewThread(page: Page) {
  await page.goto("/tests/browser/fixture/index.html?link-previews");
  await page.getByRole("button", { name: "Available agent Aion agent", exact: true }).click();
  await page.locator(".aion-chat__conversation-select").first().click();
  await expect(page.getByRole("region", { name: "Link previews" })).toBeVisible();
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}px previews`, () => {
    test.use({ viewport });
    test("places deduplicated cards below text and opens video in a new window", async ({ page }) => {
      await page.context().route("https://www.youtube.com/**", (route) =>
        route.fulfill({ contentType: "text/html", body: "<p>Original video page</p>" }));
      await openPreviewThread(page);
      const footer = page.getByRole("region", { name: "Link previews" });
      const cards = footer.locator(".aion-chat__link-preview-card");
      await expect(cards).toHaveCount(3);
      await expect(cards.first()).toContainText("Article preview");
      await expect(cards.nth(1)).toContainText("Video preview");
      await expect(cards.nth(2)).toContainText("Post preview");
      await expect(footer.locator("img").first()).toHaveJSProperty("naturalWidth", 1600);
      await expect(page.locator("iframe")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Unavailable", exact: true })).toBeVisible();
      const text = await page.getByText("Resources:", { exact: false }).boundingBox();
      const footerBox = (await footer.boundingBox())!;
      expect(footerBox.y).toBeGreaterThanOrEqual(text!.y + text!.height);
      for (const image of await footer.locator("img").all()) {
        const box = (await image.boundingBox())!;
        expect(box.height).toBeLessThanOrEqual(Math.min(viewport.height * 0.12, 96) + 1);
      }
      expect(footerBox.x + footerBox.width).toBeLessThanOrEqual(viewport.width);
      await expect(footer).toHaveCSS("scrollbar-width", "none");
      const first = (await cards.first().boundingBox())!;
      const second = (await cards.nth(1).boundingBox())!;
      expect(second.y).toBe(first.y);
      expect(first.width).toBeLessThanOrEqual(208);
      expect((await cards.nth(2).boundingBox())!.y).toBe(first.y);
      if (viewport.width < 640) {
        const dimensions = await footer.evaluate((element) => ({
          width: element.clientWidth, content: element.scrollWidth,
        }));
        expect(dimensions.content).toBeGreaterThan(dimensions.width);
        // Tabbing to an offscreen card scrolls the strip without wrapping.
        await cards.first().focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await expect(cards.nth(2)).toBeFocused();
        expect(await footer.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      }
      await expect.poll(() => page.getByRole("log").evaluate((element) =>
        element.scrollHeight - element.scrollTop - element.clientHeight,
      )).toBeLessThanOrEqual(2);

      const video = footer.getByRole("link", { name: /Video preview/ });
      const popupOpened = page.waitForEvent("popup");
      await video.click();
      const popup = await popupOpened;
      await expect(popup).toHaveURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      await expect(popup.getByText("Original video page")).toBeVisible();
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator("iframe")).toHaveCount(0);
      await popup.close();
    });
  });
}

test("opens X in a new window using keyboard activation", async ({ page }) => {
  await page.context().route("https://x.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Original post</p>" }));
  await openPreviewThread(page);
  const card = page.getByRole("region", { name: "Link previews" })
    .getByRole("link", { name: /Post preview/ });
  await card.focus();
  const popupOpened = page.waitForEvent("popup");
  await card.press("Enter");
  const popup = await popupOpened;
  await expect(popup).toHaveURL("https://x.com/user/status/12345");
  await expect(popup.getByText("Original post")).toBeVisible();
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await popup.close();
});
