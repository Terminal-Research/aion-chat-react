import { expect, test, type Page } from "@playwright/test";

async function openImageThread(page: Page) {
  await page.goto("/tests/browser/fixture/index.html?image-parts");
  await page.getByRole("button", {
    name: "Available agent Aion agent", exact: true,
  }).click();
  await page.locator(".aion-chat__conversation-select").first().click();
}

for (const example of [
  { name: "desktop landscape", viewport: { width: 1280, height: 800 }, width: 1600, height: 1000, touch: false },
  { name: "desktop portrait", viewport: { width: 1280, height: 800 }, width: 1000, height: 1800, touch: false },
  { name: "mobile landscape", viewport: { width: 390, height: 844 }, width: 1600, height: 1000, touch: true },
  { name: "small image", viewport: { width: 1280, height: 800 }, width: 64, height: 48, touch: false },
]) {
  test.describe(example.name, () => {
    test.use({ viewport: example.viewport, hasTouch: example.touch, isMobile: example.touch });

    test("keeps image sections ordered and expands within the viewport", async ({ page }) => {
      let releaseImage = () => {};
      const imageReady = new Promise<void>((resolve) => { releaseImage = resolve; });
      await page.route("**/tests/browser/fixture/image.svg", async (route) => {
        await imageReady;
        await route.fulfill({
          contentType: "image/svg+xml",
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="${example.width}" height="${example.height}"><rect width="100%" height="100%" fill="#53786b"/></svg>`,
        });
      });
      await openImageThread(page);
      const transcript = page.getByRole("log");
      const preview = transcript.getByRole("button", { name: "Expand Landscape.svg" });
      const thumbnail = preview.getByRole("img");
      await expect(transcript.getByText("After the image.")).toBeVisible();
      releaseImage();
      await expect(thumbnail).toHaveJSProperty("naturalWidth", example.width);
      await expect(preview).toBeVisible();
      await expect.poll(() => transcript.evaluate((element) =>
        element.scrollHeight - element.scrollTop - element.clientHeight,
      )).toBeLessThanOrEqual(2);

      const before = await transcript.getByText("Before the image.").boundingBox();
      const after = await transcript.getByText("After the image.").boundingBox();
      const thumb = (await thumbnail.boundingBox())!;
      expect(thumb.height).toBeLessThanOrEqual(example.viewport.height * 0.2 + 1);
      expect(thumb.width / thumb.height).toBeCloseTo(example.width / example.height, 2);
      expect(before!.y + before!.height).toBeLessThanOrEqual(thumb.y);
      expect(thumb.y + thumb.height).toBeLessThanOrEqual(after!.y);
      expect(thumb.x + thumb.width).toBeLessThanOrEqual(example.viewport.width);

      await page.locator(".browser-fixture__theme").evaluate((element) => {
        (element as HTMLElement).style.setProperty("--aion-chat-color-background", "rgb(240, 245, 250)");
      });
      if (example.touch) await preview.click();
      else {
        await preview.focus();
        await preview.press("Enter");
      }
      const dialog = page.getByRole("dialog", { name: "Landscape.svg" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS("background-color", "rgb(240, 245, 250)");
      const expanded = dialog.getByRole("img", { name: "Landscape.svg" });
      await expect(expanded).toHaveJSProperty("naturalWidth", example.width);
      const large = (await expanded.boundingBox())!;
      const modal = (await dialog.boundingBox())!;
      expect(large.width).toBeGreaterThanOrEqual(thumb.width);
      expect(large.height).toBeGreaterThanOrEqual(thumb.height);
      expect(large.width).toBeLessThanOrEqual(example.width);
      expect(large.height).toBeLessThanOrEqual(example.height);
      expect(large.width / large.height).toBeCloseTo(example.width / example.height, 2);
      expect(modal.x).toBeGreaterThanOrEqual(0);
      expect(modal.y).toBeGreaterThanOrEqual(0);
      expect(modal.x + modal.width).toBeLessThanOrEqual(example.viewport.width);
      expect(modal.y + modal.height).toBeLessThanOrEqual(example.viewport.height);
      expect(large.x + large.width).toBeLessThanOrEqual(modal.x + modal.width);
      expect(large.y + large.height).toBeLessThanOrEqual(modal.y + modal.height);

      const close = dialog.getByRole("button", { name: "Close image" });
      await expect(close).toBeVisible();
      await close.click();
      await expect(dialog).toBeHidden();
      await expect(preview).toBeFocused();
      await preview.press("Enter");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(preview).toBeFocused();
      await preview.click();
      await expect(dialog).toBeVisible();
      await page.mouse.click(4, 4);
      await expect(dialog).toBeHidden();
    });
  });
}

test("keeps a usable file link when the image URL cannot be loaded", async ({ page }) => {
  await page.route("**/tests/browser/fixture/image.svg", (route) =>
    route.fulfill({ status: 404, body: "Image no longer available" }),
  );
  await openImageThread(page);
  const transcript = page.getByRole("log");
  await expect(transcript.getByRole("link", { name: "Landscape.svg" }))
    .toHaveAttribute("href", "/tests/browser/fixture/image.svg");
  await expect(transcript.getByRole("img", { name: "Landscape.svg" })).toHaveCount(0);
  await expect(transcript.getByRole("button", { name: "Expand Landscape.svg" })).toHaveCount(0);
});
