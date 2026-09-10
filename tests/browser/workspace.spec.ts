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

    const firstConversation = page.getByRole("button", {
      name: /Conversation available-context-01/i,
    });
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
    await page.getByRole("button", {
      name: /Conversation unavailable-context/i,
    }).click();

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
});
