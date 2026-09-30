import { expect, test, type Page } from "@playwright/test";

async function emit(page: Page, change: Record<string, unknown>) {
  await page.evaluate((update) => {
    window.dispatchEvent(
      new CustomEvent("conversation-updates", {
        detail: {
          reset: false,
          updates: [
            {
              organizationId: "browser-fixture",
              agentEnvironmentId: "environment",
              distributionId: "available-agent",
              contextId: "available-context-01",
              updatedAt: "2026-09-12T12:00:00Z",
              ...update,
            },
          ],
        },
      }),
    );
  }, change);
}

test("background thread progress completes without replacing the open conversation", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixture/index.html?updates");
  await page
    .getByRole("button", { name: "Available agent Aion agent", exact: true })
    .click();
  await page.locator(".aion-chat__conversation-select").nth(1).click();
  const selected = page.locator(
    ".aion-chat__conversation-select[aria-current=true]",
  );
  const selectedTitle = await selected.textContent();
  await emit(page, {
    kind: "TaskStatusUpdated",
    taskId: "background",
    taskState: "TASK_STATE_WORKING",
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Task in progress" }),
  ).toBeVisible();
  await emit(page, {
    kind: "TaskStatusUpdated",
    taskId: "background",
    taskState: "TASK_STATE_COMPLETED",
  });
  await expect(page.getByText("Task completed", { exact: true })).toHaveCount(
    1,
  );
  await expect(page.getByText("Task completed", { exact: true })).toHaveCount(
    0,
  );
  await expect(selected).toHaveText(selectedTitle!);
  await emit(page, {
    kind: "ConversationSummaryUpdated",
    title: "A completely new title",
    summary: "Background summary",
    summarizedThroughTurn: 1,
  });
  const title = page.getByText("A completely new title", { exact: true });
  await expect(title).toHaveClass("aion-chat__thread-title-reveal");
  await expect(title).not.toHaveClass("aion-chat__thread-title-reveal");
  await emit(page, {
    kind: "ConversationSummaryUpdated",
    title: "Another replacement",
    summary: "Changed summary",
    summarizedThroughTurn: 10,
    updatedAt: "2026-09-12T12:00:01Z",
  });
  await expect(
    page.getByText("Another replacement", { exact: true }),
  ).toHaveClass("aion-chat__thread-title-reveal");
  await expect(selected).toHaveText(selectedTitle!);
});

test("replacement titles respect reduced motion and remain keyboard accessible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/browser/fixture/index.html?updates");
  await page
    .getByRole("button", { name: "Available agent Aion agent", exact: true })
    .click();
  await emit(page, {
    kind: "ConversationSummaryUpdated",
    title: "Accessible title",
    summary: "Summary",
    summarizedThroughTurn: 1,
  });
  const title = page.getByText("Accessible title", { exact: true });
  await expect(title).toBeVisible();
  expect(
    await title.evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  const button = page.getByRole("button", { name: /^Accessible title/u });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-current", "true");
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`thread indicators stay visible beside long titles at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/tests/browser/fixture/index.html?updates");
    await page.getByRole("button", {
      name: "Available agent Aion agent", exact: true,
    }).click();
    await page.locator(".aion-chat__conversation-select").first().click();
    await emit(page, {
      kind: "ConversationSummaryUpdated",
      title: "A long thread title that must truncate before the waiting or completion indicator",
      summary: null,
      summarizedThroughTurn: 1,
    });
    const row = page.getByRole("listitem").filter({
      has: page.locator(".aion-chat__conversation-select[aria-current=true]"),
    });
    const indicator = row.getByRole("status");
    const icon = indicator.locator("svg");
    await page.getByRole("textbox", { name: "Chat message" }).fill("Waiting test");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Waiting for the agent", { exact: true }))
      .toBeVisible();
    await expect(indicator).toHaveAttribute("data-activity-phase", "pending");
    await expect(icon).toBeInViewport({ ratio: 1 });
    const navigation = page.getByRole("navigation", { name: "Chat navigation" });
    const navigationBounds = (await navigation.boundingBox())!;
    const rowBounds = (await row.boundingBox())!;
    const pendingBounds = (await indicator.boundingBox())!;
    expect(pendingBounds.x + pendingBounds.width)
      .toBeLessThanOrEqual(navigationBounds.x + navigationBounds.width);
    expect(Math.abs(
      pendingBounds.y + pendingBounds.height / 2 -
      (rowBounds.y + rowBounds.height / 2),
    )).toBeLessThan(1);
    expect(await row.evaluate((element) => {
      const list = element.closest(".aion-chat__conversation-list")!;
      return list.scrollWidth <= list.clientWidth;
    })).toBe(true);
    await emit(page, {
      kind: "TaskStatusUpdated",
      taskId: "local-request",
      taskState: "TASK_STATE_COMPLETED",
    });
    await expect(indicator).toHaveAttribute("data-activity-phase", "pending");
    await page.evaluate(() => window.dispatchEvent(new Event("complete-chat-request")));
    await expect(indicator).toHaveAttribute("data-activity-phase", "succeeded");
    await expect(icon).toBeInViewport({ ratio: 1 });
    const completedBounds = (await indicator.boundingBox())!;
    expect(completedBounds.x).toBeCloseTo(pendingBounds.x, 1);
    expect(completedBounds.y).toBeCloseTo(pendingBounds.y, 1);
    await expect(indicator).toHaveCount(0);
  });
}
