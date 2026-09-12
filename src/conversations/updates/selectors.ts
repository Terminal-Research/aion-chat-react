import type { AionActivityPhase } from "../../motion/AionActivityIndicator";
import {
  conversationKey,
  isTerminalTask,
  type ConversationUpdatesState,
} from "./store";

/** Select a single canonical thread through its explicit catalog mapping. */
export function selectConversationThread(
  state: ConversationUpdatesState,
  agentId: string,
  contextId: string,
) {
  const key = state.routes[conversationKey(agentId, contextId)];
  return key ? state.threads[key] : undefined;
}

/** A later authoritative read can clear generated text without deleting checkpoints. */
export function selectConversationMetadata(
  state: ConversationUpdatesState,
  agentId: string,
  contextId: string,
) {
  const read = state.metadata[conversationKey(agentId, contextId)];
  const live = selectConversationThread(state, agentId, contextId)?.metadata;
  return read && (!live || read.revision >= live.revision) ? read : live;
}

/** Pending work wins over a different task's success; failures never imply success. */
export function conversationActivity(
  thread: ReturnType<typeof selectConversationThread>,
): AionActivityPhase | undefined {
  const active = Object.values(thread?.tasks ?? {}).filter(
    (task) => !isTerminalTask(task.state),
  );
  if (
    active.some(
      (task) =>
        task.state !== "TASK_STATE_INPUT_REQUIRED" &&
        task.state !== "TASK_STATE_AUTH_REQUIRED",
    )
  )
    return "pending";
  if (active.length) return "requires-action";
  return thread?.completedUntil ? "succeeded" : undefined;
}
