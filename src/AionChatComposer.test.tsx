import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AionChatComposer,
  type AionChatComposerProps,
} from "./AionChatComposer";

afterEach(cleanup);

const DEFAULT_PROPS: AionChatComposerProps = {
  value: "",
  status: "idle",
  canSend: false,
  attachments: [],
  onChange: vi.fn(),
  onRemoveAttachment: vi.fn(),
  onSend: vi.fn(),
  onStop: vi.fn(),
};

describe("AionChatComposer", () => {
  it("autosizes controlled multiline input", () => {
    const view = render(<AionChatComposer {...DEFAULT_PROPS} />);
    const textarea = screen.getByRole("textbox", { name: "Chat message" });
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 96,
    });

    view.rerender(
      <AionChatComposer {...DEFAULT_PROPS} value={"First line\nSecond line"} />,
    );

    expect(textarea.style.height).toBe("96px");
  });

  it("restores input focus after a button submission", () => {
    const onSend = vi.fn();
    render(
      <AionChatComposer
        {...DEFAULT_PROPS}
        value="Ready"
        canSend
        onSend={onSend}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "Chat message" });
    const send = screen.getByRole("button", { name: "Send" });
    send.focus();

    fireEvent.click(send);

    expect(onSend).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(textarea);
  });

  it("renders host-supplied actions without changing send behavior", () => {
    const onHostAction = vi.fn();
    render(
      <AionChatComposer {...DEFAULT_PROPS}>
        <button type="button" onClick={onHostAction}>
          Insert prompt
        </button>
      </AionChatComposer>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Insert prompt" }));

    expect(onHostAction).toHaveBeenCalledOnce();
  });

  it("presents unavailable conversations as read-only", () => {
    const onChange = vi.fn();
    const onSelectAttachments = vi.fn();
    const onHostAction = vi.fn();
    const reason = "This Playground distribution is not active.";
    const view = render(
      <AionChatComposer
        {...DEFAULT_PROPS}
        readOnly
        readOnlyReason={reason}
        onChange={onChange}
        onSelectAttachments={onSelectAttachments}
      >
        <button type="button" onClick={onHostAction}>
          Insert prompt
        </button>
      </AionChatComposer>,
    );

    const textarea = screen.getByRole("textbox", { name: "Chat message" });
    expect(textarea).toHaveProperty("readOnly", true);
    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attach files" }))
      .toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Send" }))
      .toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Insert prompt" }))
      .toBeNull();
    expect(
      view.container.querySelector<HTMLInputElement>("input[type=file]")
        ?.disabled,
    ).toBe(true);

    fireEvent.change(textarea, { target: { value: "/help" } });

    expect(onChange).not.toHaveBeenCalled();
    expect(onSelectAttachments).not.toHaveBeenCalled();
    expect(onHostAction).not.toHaveBeenCalled();
  });

  it("removes an attachment draft and returns focus to the input", () => {
    const onRemoveAttachment = vi.fn();
    const file = new File(["draft"], "draft.txt", { type: "text/plain" });
    render(
      <AionChatComposer
        {...DEFAULT_PROPS}
        attachments={[
          {
            id: "attachment-1",
            status: "uploaded",
            file,
            uploaded: { url: "https://files.example/draft.txt" },
          },
        ]}
        onRemoveAttachment={onRemoveAttachment}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove draft.txt" }),
    );

    expect(onRemoveAttachment).toHaveBeenCalledWith("attachment-1");
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Chat message" }),
    );
  });
});
