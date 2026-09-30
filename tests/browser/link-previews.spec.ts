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
    test("places deduplicated cards below text and expands video in the shared dialog", async ({ page }) => {
      const embedRequests: string[] = [];
      await page.route("https://www.youtube-nocookie.com/**", (route) => {
        embedRequests.push(route.request().url());
        return route.fulfill({ contentType: "text/html", body: "<p>Provider player</p>" });
      });
      await openPreviewThread(page);
      const footer = page.getByRole("region", { name: "Link previews" });
      const cards = footer.locator(".aion-chat__link-preview-card");
      await expect(cards).toHaveCount(3);
      await expect(cards.first()).toContainText("Article preview");
      await expect(cards.nth(1)).toContainText("Video preview");
      await expect(cards.nth(2)).toContainText("Post preview");
      await expect(footer.locator("img").first()).toHaveJSProperty("naturalWidth", 1600);
      expect(embedRequests).toEqual([]);
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

      const expand = footer.getByRole("button", { name: "Expand Video preview" });
      await expand.click();
      const dialog = page.getByRole("dialog", { name: "Video preview" });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      const modal = (await dialog.boundingBox())!;
      expect(modal.x).toBeGreaterThanOrEqual(0);
      expect(modal.y).toBeGreaterThanOrEqual(0);
      expect(modal.x + modal.width).toBeLessThanOrEqual(viewport.width);
      expect(modal.y + modal.height).toBeLessThanOrEqual(viewport.height);
      await dialog.getByRole("button", { name: "Close preview" }).click();
      await expect(dialog).toBeHidden();
      await expect(expand).toBeFocused();
      await expand.press("Enter");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  });
}

test("runs X in a separate provider origin only after expansion", async ({ page }) => {
  let frames = 0;
  await page.route("https://platform.twitter.com/embed/**", (route) => {
    frames += 1;
    return route.fulfill({ contentType: "text/html", body: `<script>
      try { parent.document.body.dataset.providerAccess = 'unsafe'; }
      catch { document.write('<p>Provider isolated</p>'); }
    </script>` });
  });
  await openPreviewThread(page);
  expect(frames).toBe(0);
  await page.getByRole("button", { name: "Expand Post preview" }).click();
  const dialog = page.getByRole("dialog", { name: "Post preview" });
  await expect(dialog.frameLocator("iframe").getByText("Provider isolated")).toBeVisible();
  expect(frames).toBe(1);
  expect(await page.locator("body").getAttribute("data-provider-access")).toBeNull();
  await expect(dialog.getByRole("link", { name: "Open original" }))
    .toHaveAttribute("href", "https://x.com/user/status/12345");
});
