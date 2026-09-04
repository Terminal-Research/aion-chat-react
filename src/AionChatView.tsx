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
import { AionChatError, type AionChatErrorProps } from "./AionChatActivity";
import {
  AionResponseActivity,
  type AionResponseActivityProps,
} from "./motion/AionActivityIndicator";
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
  readonly error?: AionSlotValue<AionChatErrorProps, "error">;
  readonly responseActivity?: AionSlotValue<
    AionResponseActivityProps,
    "conversation"
  >;
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
  const ErrorComponent = slots.error?.component ?? AionChatError;
  const ResponseActivityComponent =
    slots.responseActivity?.component ?? AionResponseActivity;
  const error = state.conversation.activeRun?.error;
  const composerStatus = meta.isRunning
    ? "running"
    : meta.isUploading
      ? "uploading"
      : "idle";
  const transcriptEntries = useMemo(() => {
    const activeRun = state.conversation.activeRun;
    const activeTurn = state.conversation.turns.find(
      (turn) => turn.id === activeRun?.turnId,
    );
    const streamingMessageIds = new Set(
      activeRun?.status === "running"
        ? activeTurn?.assistantMessageIds
        : undefined,
    );
    const messagesById = new Map(
      state.conversation.messages.map((message) => [message.id, message]),
    );
    return state.conversation.transcript.flatMap<AionChatTranscriptEntry>(
      (item) => {
        if (item.type === "message") {
          const message = messagesById.get(item.id);
          return message
            ? [
                {
                  type: "message" as const,
                  message,
                  streaming: streamingMessageIds.has(message.id),
                },
              ]
            : [];
        }
        if (item.type === "artifact") {
          const artifact = state.conversation.artifacts[item.id];
          return artifact ? [{ type: "artifact" as const, artifact }] : [];
        }
        const task = state.conversation.tasks[item.id];
        return task ? [{ type: "task" as const, task }] : [];
      },
    );
  }, [
    state.conversation.artifacts,
    state.conversation.activeRun,
    state.conversation.messages,
    state.conversation.tasks,
    state.conversation.transcript,
    state.conversation.turns,
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
      <ResponseActivityComponent
        {...slots.responseActivity?.props}
        conversation={state.conversation}
      />
      {error && (
        <ErrorComponent {...slots.error?.props} error={error} />
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
