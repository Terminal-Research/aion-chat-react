/*
 * Controlled view composition adapted from CopilotKit's chat view:
 * packages/react-core/src/v2/components/chat/CopilotChatView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import { type ComponentType, type HTMLAttributes, useMemo } from "react";

import {
  AionChatComposer,
  type AionChatComposerProps,
} from "./AionChatComposer";
import type {
  AionChatEmptyStateProps,
  AionChatTranscriptEntry,
} from "./AionChatTranscript";
import { AionChatTranscript } from "./AionChatTranscript";
import type { AionChatMessageProps } from "./AionChatMessage";
import type { AionChatArtifactProps } from "./AionChatArtifact";
import type { AionChatMarkdownComponent } from "./AionChatMarkdown";
import { useAionChat } from "./hooks";

/** Typed replacement components accepted by the inline chat view. */
export interface AionChatViewSlots {
  readonly message?: ComponentType<AionChatMessageProps>;
  readonly artifact?: ComponentType<AionChatArtifactProps>;
  readonly emptyState?: ComponentType<AionChatEmptyStateProps>;
  readonly composer?: ComponentType<AionChatComposerProps>;
  readonly markdown?: AionChatMarkdownComponent;
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
  const Composer = slots.composer ?? AionChatComposer;
  const runStatus = state.conversation.activeRun?.status;
  const error = state.conversation.activeRun?.error;
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
        messageComponent={slots.message}
        artifactComponent={slots.artifact}
        emptyStateComponent={slots.emptyState}
        markdownComponent={slots.markdown}
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
        value={state.draft}
        isRunning={meta.isRunning}
        canSend={meta.canSend}
        onChange={actions.setDraft}
        onSend={() => void actions.send()}
        onStop={actions.stop}
      />
    </section>
  );
}
