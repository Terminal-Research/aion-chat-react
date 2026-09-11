import { expect, test, type Locator } from "@playwright/test";

async function boxesFor(left: Locator, right: Locator) {
  const [leftBox, rightBox] = await Promise.all([
    left.boundingBox(),
    right.boundingBox(),
  ]);
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  return { leftBox: leftBox!, rightBox: rightBox! };
}

test.describe("AionChatWorkspace browser behavior", () => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`keeps ${viewport.name} navigation and chat regions separate`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/tests/browser/fixture/index.html");

      const navigation = page.getByRole("navigation", {
        name: "Chat navigation",
      });
      const chat = page.getByRole("region", { name: "Conversation" });
      await expect(navigation).toBeVisible();
      await expect(chat).toBeVisible();
      const { leftBox: navigationBox, rightBox: chatBox } =
        await boxesFor(navigation, chat);

      if (viewport.name === "desktop") {
        expect(navigationBox.x + navigationBox.width).toBeLessThanOrEqual(
          chatBox.x + 1,
        );
      } else {
        expect(navigationBox.y + navigationBox.height).toBeLessThanOrEqual(
          chatBox.y + 1,
        );
      }
    });
  }

  test("scrolls long navigation and transcripts in their own regions", async ({
    page,
  }) => {
    await page.goto("/tests/browser/fixture/index.html");
    await page.getByRole("button", {
      name: "Available agent Aion agent",
      exact: true,
    }).click();

    const firstConversation = page
      .locator(".aion-chat__conversation-select")
      .first();
    await expect(firstConversation).toBeVisible();
    await firstConversation.click();

    const transcript = page.getByRole("log");
    await expect(
      transcript.getByText(
        "Historical response 63 for available-context-01.",
      ),
    ).toBeVisible();
    const transcriptMetrics = await transcript.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(transcriptMetrics.scrollHeight).toBeGreaterThan(
      transcriptMetrics.clientHeight,
    );

    const navigation = page.locator(".aion-chat__conversation-list");
    const navigationMetrics = await navigation.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    expect(navigationMetrics.overflowY).toBe("auto");
    expect(navigationMetrics.scrollHeight).toBeGreaterThan(
      navigationMetrics.clientHeight,
    );
    await navigation.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(
      () => navigation.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);

    await expect.poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) =>
          key.startsWith("aion-chat:conversations:v1:browser-fixture"),
        ),
      ),
    ).toBe(true);
  });

  test("fills the navigation column with the selected Threads panel", async ({
    page,
  }) => {
    await page.goto("/tests/browser/fixture/index.html");
    const navigation = page.getByRole("navigation", {
      name: "Chat navigation",
    });
    const aionsTitle = page.getByRole("heading", { name: "Aions" });
    const { leftBox: navigationBox, rightBox: aionsTitleBox } =
      await boxesFor(navigation, aionsTitle);
    expect(
      Math.abs(
        aionsTitleBox.x + aionsTitleBox.width / 2 -
          (navigationBox.x + navigationBox.width / 2),
      ),
    ).toBeLessThan(1);

    await page.getByRole("button", {
      name: "Available agent Aion agent",
      exact: true,
    }).click();

    const threads = page.getByRole("region", { name: "Threads" });
    await expect.poll(
      () => navigation.evaluate((element) => element.scrollLeft),
    ).toBe(0);

    await expect.poll(async () => {
      const { leftBox: navigationBox, rightBox: threadsBox } =
        await boxesFor(navigation, threads);
      return Math.abs(threadsBox.x - navigationBox.x);
    }).toBeLessThan(1);

    const { leftBox: settledNavigationBox, rightBox: threadsBox } =
      await boxesFor(navigation, threads);
    expect(Math.abs(threadsBox.width - settledNavigationBox.width))
      .toBeLessThanOrEqual(1);
    const threadsTitle = page.getByRole("heading", { name: "Threads" });
    const threadsTitleBox = await threadsTitle.boundingBox();
    expect(threadsTitleBox).not.toBeNull();
    expect(
      Math.abs(
        threadsTitleBox!.x + threadsTitleBox!.width / 2 -
          (settledNavigationBox.x + settledNavigationBox.width / 2),
      ),
    ).toBeLessThan(1);

    const workspaceHeader = page.locator(".aion-chat__workspace-header");
    const workspaceAvatar = workspaceHeader.locator(
      ".aion-chat__workspace-avatar",
    );
    const workspaceTitle = workspaceHeader.getByRole("heading", {
      name: "Available agent",
    });
    const { leftBox: avatarBox, rightBox: workspaceTitleBox } =
      await boxesFor(workspaceAvatar, workspaceTitle);
    expect(avatarBox.x + avatarBox.width).toBeLessThanOrEqual(
      workspaceTitleBox.x,
    );
    const avatarHeight = await workspaceHeader.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        Number.parseFloat(style.lineHeight) +
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom)
      );
    });
    expect(Math.abs(avatarBox.height - avatarHeight)).toBeLessThan(1);
  });

  test("grows the composer from one line through five lines", async ({
    page,
  }) => {
    await page.goto("/tests/browser/fixture/index.html");
    await page.getByRole("button", {
      name: "Available agent Aion agent",
      exact: true,
    }).click();
    await page.getByRole("button", { name: "New thread" }).click();

    const composer = page.getByRole("textbox", { name: "Chat message" });
    await expect(composer).toHaveAttribute("placeholder", "Enter message...");
    await expect(composer).toHaveAttribute("rows", "1");
    const initialHeight = await composer.evaluate(
      (element) => element.getBoundingClientRect().height,
    );

    await composer.fill("One\nTwo\nThree\nFour\nFive\nSix");

    const expanded = await composer.evaluate((element) => {
      const style = getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight);
      const frame =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth);
      return {
        height: element.getBoundingClientRect().height,
        maximumHeight: lineHeight * 5 + frame,
        overflowY: style.overflowY,
      };
    });
    expect(expanded.height).toBeGreaterThan(initialHeight);
    expect(Math.abs(expanded.height - expanded.maximumHeight)).toBeLessThan(1);
    expect(expanded.overflowY).toBe("auto");
  });

  test("loads unavailable-agent history into a read-only chat", async ({
    page,
  }) => {
    await page.goto("/tests/browser/fixture/index.html");
    const agent = page.getByRole("button", {
      name: /Unavailable agent/i,
    });
    await expect(agent).toHaveAttribute(
      "title",
      "This fixture agent is paused.",
    );
    await agent.click();
    await page.locator(".aion-chat__conversation-select").click();

    const chat = page.getByRole("region", {
      name: "Chat with Unavailable agent",
    });
    await expect(
      chat.getByText("Historical response 1 for unavailable-context."),
    ).toBeVisible();
    await expect(
      chat.getByText("This fixture agent is paused.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New thread" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Attach files" }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await expect(
      page.getByRole("textbox", { name: "Chat message" }),
    ).toHaveJSProperty("readOnly", true);
  });

  test("copies completed responses and opens response details", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://127.0.0.1:4174",
    });
    await page.goto("/tests/browser/fixture/index.html");
    await page.getByRole("button", {
      name: "Available agent Aion agent",
      exact: true,
    }).click();
    await page.locator(".aion-chat__conversation-select").first().click();

    const responseText =
      "Historical response 63 for available-context-01.";
    const response = page
      .locator(".aion-chat__message--assistant")
      .filter({ hasText: responseText });
    const copy = response.getByRole("button", { name: "Copy response" });
    const details = response.getByRole("button", {
      name: "View response details",
    });

    await expect(copy).toBeVisible();
    await expect
      .poll(() =>
        response
          .locator(".aion-chat__response-actions")
          .evaluate((element) => getComputedStyle(element).columnGap),
      )
      .toBe("2px");
    await expect
      .poll(() =>
        copy.evaluate((element) => getComputedStyle(element).color),
      )
      .toBe("rgb(152, 162, 179)");
    await expect(details).not.toHaveAttribute("title", /.+/);
    await details.click();

    const dialog = page.getByRole("dialog", { name: "Response Details" });
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(
      Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport!.width / 2),
    ).toBeLessThan(1);
    expect(
      Math.abs(dialogBox!.y + dialogBox!.height / 2 - viewport!.height / 2),
    ).toBeLessThan(1);
    await expect(dialog).toContainText("Task IDNot available");
    await expect(dialog).toContainText(
      "Context IDavailable-context-01",
    );
    await dialog.getByRole("button", {
      name: "Close response details",
    }).click();
    await expect(dialog).toBeHidden();

    await copy.click();
    await expect(
      response.getByRole("button", { name: "Copied response" }),
    ).toHaveAttribute("data-copy-status", "copied");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(responseText);
  });

  test("keeps the shared Aion profile in the established Catalog layout", async ({
    page,
  }) => {
    await page.goto("/tests/browser/fixture/index.html");
    await page.getByRole("button", {
      name: "Available agent Aion agent",
      exact: true,
    }).click();
    await page.getByLabel("Conversation options").click();
    await page.getByRole("button", { name: "View profile" }).click();

    const dialog = page.getByRole("dialog", { name: "Aion Profile" });
    const profile = dialog.getByRole("article", {
      name: "Available agent profile",
    });
    await expect(profile).toBeVisible();
    await expect(profile.getByRole("heading", { name: "available-agent" }))
      .toBeVisible();
    await expect(profile.getByText("Available agent", { exact: true }))
      .toBeVisible();
    await expect(profile.getByText("Principal", { exact: true }))
      .toBeVisible();

    const avatar = profile.locator(".aion-chat__profile-avatar");
    const avatarStyle = await avatar.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderRadius: Number.parseFloat(style.borderRadius),
        height: Number.parseFloat(style.height),
        width: Number.parseFloat(style.width),
      };
    });
    expect(avatarStyle.width).toBe(88);
    expect(avatarStyle.height).toBe(88);
    expect(avatarStyle.borderRadius).toBeGreaterThan(24);
    expect(avatarStyle.borderRadius).toBeLessThan(26);

    const details = profile.locator(".aion-chat__profile-details");
    await expect
      .poll(() =>
        details.evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe("rgba(0, 0, 0, 0)");
    const firstField = details.locator(".aion-chat__profile-field").first();
    const label = firstField.getByRole("term");
    const value = firstField.getByRole("definition");
    const { leftBox: labelBox, rightBox: valueBox } = await boxesFor(
      label,
      value,
    );
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(valueBox.x);
    await expect(profile.getByRole("button", { name: "Copy email" }))
      .toBeVisible();

    const channel = profile.getByRole("link", {
      name: "Open Playground: Browser fixture",
    });
    await expect(channel.getByText("Playground", { exact: true }))
      .toBeVisible();
    await expect(channel.getByText("Browser fixture", { exact: true }))
      .toBeVisible();
    await expect(channel).toHaveAttribute(
      "title",
      "Open Playground · Browser fixture · Production",
    );
    await expect(channel).toHaveAttribute(
      "href",
      "https://app.aion.to/aions/playground/available-agent-identity",
    );
  });
});
