import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`confirms thread deletion in a themed ${viewport.name} modal`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let browserPrompts = 0;
    page.on("dialog", async (dialog) => {
      browserPrompts += 1;
      await dialog.dismiss();
    });
    await page.goto("/tests/browser/fixture/index.html");
    await page.getByRole("button", {
      name: "Available agent Aion agent", exact: true,
    }).click();
    const threads = page.locator(".aion-chat__conversation-select");
    await threads.first().click();
    await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();
    const options = page.getByLabel("Conversation options");
    const open = async () => {
      await options.click();
      await page.getByRole("button", { name: "Delete chat", exact: true }).click();
    };
    await open();
    const dialog = page.getByRole("dialog", { name: "Delete Thread" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(/Active tasks will be canceled/u);
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(1);
    expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(1);
    expect(box!.width).toBeLessThan(viewport.width);

    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Cancel thread deletion" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(options).toBeFocused();
    await expect(threads).toHaveCount(40);

    await open();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(options).toBeFocused();
    await expect(threads).toHaveCount(40);

    await open();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(threads).toHaveCount(40);

    await open();
    await dialog.getByRole("button", { name: "Cancel thread deletion" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(options).toBeFocused();

    await open();
    await page.mouse.click(2, 2);
    await expect(dialog).toHaveCount(0);
    await expect(threads).toHaveCount(40);

    await open();
    // Overrides inherit through the theme's portal, including destructive actions.
    await page.locator(".aion-chat-theme").evaluate((element) => {
      (element as HTMLElement).style.setProperty("--aion-chat-color-danger", "rgb(180, 20, 30)");
    });
    await expect(dialog.getByRole("button", { name: "Delete", exact: true }))
      .toHaveCSS("background-color", "rgb(180, 20, 30)");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(threads).toHaveCount(39);
    await expect(page.getByText("Select or start a conversation.")).toBeVisible();
    expect(browserPrompts).toBe(0);
  });
}
