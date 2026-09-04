/*
 * Controlled view composition adapted from CopilotKit's chat view:
 * packages/react-core/src/v2/components/chat/CopilotChatView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import { type HTMLAttributes, useMemo } from "react";

import {
  AionChatComposer,
  type AionChatComposerProps,
} from "./AionChatComposer";
import type {
  AionChatTranscriptEntry,
  AionChatTranscriptSlots,
} from "./AionChatTranscript";
import { AionChatTranscript } from "./AionChatTranscript";
import { useAionChat } from "./hooks";
import type { AionSlotValue } from "./slots";

type ComposerOwnedProps =
  | "value"
  | "status"
  | "canSend"
  | "attachments"
  | "onChange"
  | "onSelectAttachments"
  | "onRemoveAttachment"
  | "onSend"
  | "onStop";

/** Typed replacement components accepted by the inline chat view. */
export interface AionChatViewSlots extends AionChatTranscriptSlots {
  readonly composer?: AionSlotValue<AionChatComposerProps, ComposerOwnedProps>;
}

/** Props for the transport-backed inline chat surface. */
export interface AionChatViewProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly slots?: AionChatViewSlots;
}

/** Inline chat surface backed by the nearest Aion chat provider. */
export function AionChatView({
  slots = {},
  className,
  ...props
}: AionChatViewProps) {
  const { state, actions, meta } = useAionChat();
  const Composer = slots.composer?.component ?? AionChatComposer;
  const runStatus = state.conversation.activeRun?.status;
  const error = state.conversation.activeRun?.error;
  const composerStatus = meta.isRunning
    ? "running"
    : meta.isUploading
      ? "uploading"
      : "idle";
  const transcriptEntries = useMemo(() => {
    const messagesById = new Map(
      state.conversation.messages.map((message) => [message.id, message]),
    );
    return state.conversation.transcript.flatMap<AionChatTranscriptEntry>(
      (item) => {
        if (item.type === "message") {
          const message = messagesById.get(item.id);
          return message ? [{ type: "message" as const, message }] : [];
        }
        const artifact = state.conversation.artifacts[item.id];
        return artifact ? [{ type: "artifact" as const, artifact }] : [];
      },
    );
  }, [
    state.conversation.artifacts,
    state.conversation.messages,
    state.conversation.transcript,
  ]);

  return (
    <section
      className={["aion-chat", className].filter(Boolean).join(" ")}
      aria-label={state.agent ? `Chat with ${state.agent.title}` : "Agent chat"}
      {...props}
    >
      <AionChatTranscript
        entries={transcriptEntries}
        agentTitle={state.agent?.title}
        slots={slots}
      />
      {runStatus === "input-required" && (
        <p className="aion-chat__status" role="status">
          The agent needs more information.
        </p>
      )}
      {runStatus === "auth-required" && (
        <p className="aion-chat__status" role="status">
          Authentication is required to continue.
        </p>
      )}
      {error && (
        <p className="aion-chat__error" role="alert">
          {error.message}
        </p>
      )}
      <Composer
        {...slots.composer?.props}
        value={state.draft}
        status={composerStatus}
        canSend={meta.canSend}
        attachments={state.attachments}
        onChange={actions.setDraft}
        onSelectAttachments={actions.addAttachments}
        onRemoveAttachment={actions.removeAttachment}
        onSend={() => void actions.send()}
        onStop={actions.stop}
      />
    </section>
  );
}
