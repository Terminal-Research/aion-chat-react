import { expect, test, type Page } from "@playwright/test";

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));
}

async function openThread(page: Page) {
  await page.goto("/tests/browser/fixture/index.html?reply-space&long-history");
  await page.getByRole("button", {
    name: "Available agent Aion agent", exact: true,
  }).click();
  await page.locator(".aion-chat__conversation-select").first().click();
  await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();
  await settle(page);
}

async function send(page: Page, text = "Make room for this response.") {
  await page.getByRole("textbox", { name: "Chat message" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Waiting for the agent", { exact: true })).toBeVisible();
  await settle(page);
}

async function reply(page: Page, step: { text?: string; finish?: "completed" | "failed" }) {
  await page.evaluate((detail) => window.dispatchEvent(
    new CustomEvent("chat-reply", { detail }),
  ), step);
  await settle(page);
}

async function geometry(page: Page) {
  return page.getByRole("log").evaluate((viewport) => {
    const spacer = viewport.querySelector<HTMLElement>(".aion-chat__reply-space")!;
    const anchor = viewport.querySelector<HTMLElement>("[data-scroll-anchor=true]");
    const bounds = viewport.getBoundingClientRect();
    return {
      top: viewport.scrollTop,
      height: viewport.clientHeight,
      maximum: viewport.scrollHeight - viewport.clientHeight,
      spacer: spacer.getBoundingClientRect().height,
      anchorBottom: anchor ? anchor.getBoundingClientRect().bottom - bounds.top : 0,
    };
  });
}

async function scrollBy(page: Page, pixels: number) {
  const before = await geometry(page);
  const expectedTop = Math.max(0, Math.min(before.maximum, before.top + pixels));
  await page.getByRole("log").hover();
  await page.mouse.wheel(0, pixels);
  await expect.poll(async () => (await geometry(page)).top)
    .toBeCloseTo(expectedTop, 0);
  await settle(page);
}

for (const width of [1280, 390]) {
  test(`short replies preserve their reading position and clear space safely at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openThread(page);
    await send(page);
    const initial = await geometry(page);
    expect(initial.spacer).toBeGreaterThan(100);
    expect(Math.abs(initial.anchorBottom - initial.height / 2)).toBeLessThan(initial.height * 0.06);

    await reply(page, { text: "A short streamed response." });
    const streaming = await geometry(page);
    expect(streaming.spacer).toBeLessThan(initial.spacer);
    expect(Math.abs(streaming.anchorBottom - initial.anchorBottom)).toBeLessThan(3);
    await reply(page, { finish: "completed" });
    const completed = await geometry(page);
    expect(completed.spacer).toBeGreaterThan(0);
    expect(Math.abs(completed.anchorBottom - streaming.anchorBottom)).toBeLessThan(3);

    // A tiny upward movement must not collapse space still within the viewport.
    await scrollBy(page, -10);
    const smallScroll = await geometry(page);
    expect(smallScroll.spacer).toBe(completed.spacer);
    expect(Math.abs(smallScroll.top - (completed.top - 10))).toBeLessThan(2);

    // Once all of the spacer is below the viewport, remove it in one operation.
    const delta = smallScroll.spacer + 40;
    await scrollBy(page, -delta);
    const cleared = await geometry(page);
    expect(cleared.spacer).toBe(0);
    expect(Math.abs(cleared.top - (smallScroll.top - delta))).toBeLessThan(2);
    await scrollBy(page, 100000);
    const bottom = await geometry(page);
    expect(Math.abs(bottom.top - bottom.maximum)).toBeLessThan(2);
    expect(bottom.spacer).toBe(0);
  });
}

test("long replies consume the space and follow output until the reader scrolls away", async ({ page }) => {
  await openThread(page);
  await send(page);
  await reply(page, { text: "A growing response.\n\n".repeat(40) });
  const filled = await geometry(page);
  expect(filled.spacer).toBe(0);
  expect(Math.abs(filled.top - filled.maximum)).toBeLessThan(2);
  await scrollBy(page, -300);
  const reading = await geometry(page);
  await reply(page, { text: "More output.\n\n".repeat(15) });
  expect((await geometry(page)).top).toBe(reading.top);
  await reply(page, { finish: "completed" });
  expect((await geometry(page)).top).toBe(reading.top);
  await page.getByRole("button", { name: "Scroll to latest message" }).click();
  const latest = await geometry(page);
  expect(Math.abs(latest.top - latest.maximum)).toBeLessThan(2);
});

test("manual scrolling during a short stream stays put and latest clears completed space", async ({ page }) => {
  await openThread(page);
  await send(page);
  await scrollBy(page, -20);
  const reading = await geometry(page);
  await reply(page, { text: "Short output." });
  expect((await geometry(page)).top).toBe(reading.top);
  await reply(page, { finish: "completed" });
  expect((await geometry(page)).spacer).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Scroll to latest message" }).click();
  const latest = await geometry(page);
  expect(latest.spacer).toBe(0);
  expect(Math.abs(latest.top - latest.maximum)).toBeLessThan(2);
});

for (const outcome of ["empty", "stopped", "failed"] as const) {
  test(`${outcome} replies retain space without jumping and reopening clears it`, async ({ page }) => {
    await openThread(page);
    await send(page);
    const pending = await geometry(page);
    if (outcome === "stopped") {
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await settle(page);
    } else await reply(page, { finish: outcome === "failed" ? "failed" : "completed" });
    const finished = await geometry(page);
    expect(finished.spacer).toBeGreaterThan(0);
    expect(Math.abs(finished.anchorBottom - pending.anchorBottom)).toBeLessThan(3);
    await page.locator(".aion-chat__conversation-select").nth(1).click();
    await page.getByRole("button", { name: /^available-context-01 prompt/u }).click();
    await expect.poll(async () => (await geometry(page)).spacer).toBe(0);
    const restored = await geometry(page);
    expect(Math.abs(restored.top - restored.maximum)).toBeLessThan(2);
  });
}


test("completed space handles late content and composer resizing without moving text", async ({ page }) => {
  await openThread(page);
  // The host frontend applies a global border-box reset; support both models.
  await page.addStyleTag({ content: ".aion-chat__transcript { box-sizing: border-box; }" });
  await send(page);
  await reply(page, { text: "A response with delayed media." });
  await reply(page, { finish: "completed" });
  const finished = await geometry(page);
  await page.getByRole("log").locator(".aion-chat__transcript-entry").last()
    .evaluate((element) => { element.style.paddingBottom = "80px"; });
  await settle(page);
  const media = await geometry(page);
  expect(media.spacer).toBeLessThan(finished.spacer);
  expect(Math.abs(media.anchorBottom - finished.anchorBottom)).toBeLessThan(2);
  await page.getByRole("textbox", { name: "Chat message" })
    .fill("A draft\nwith several lines\nthat resizes\nthe composer.");
  await settle(page);
  expect(Math.abs((await geometry(page)).anchorBottom - finished.anchorBottom)).toBeLessThan(2);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await settle(page);
  expect(Math.abs((await geometry(page)).anchorBottom - finished.anchorBottom)).toBeLessThan(2);
});

test("consecutive turns replace the space and new empty threads do not inherit it", async ({ page }) => {
  await openThread(page);
  await send(page);
  await reply(page, { text: "The first short reply." });
  await reply(page, { finish: "completed" });
  await send(page, "The second user message.");
  const second = await geometry(page);
  expect(second.spacer).toBeGreaterThan(0);
  expect(second.spacer).toBeLessThan(second.height / 2 + 24);
  expect(Math.abs(second.anchorBottom - second.height / 2)).toBeLessThan(3);
  await reply(page, { finish: "completed" });
  await page.getByRole("button", { name: "New thread", exact: true }).click();
  await send(page, "A first message in a fresh thread.");
  expect((await geometry(page)).spacer).toBe(0);
  await reply(page, { text: "A short reply in the new thread." });
  await reply(page, { finish: "completed" });
  expect((await geometry(page)).spacer).toBe(0);
});
