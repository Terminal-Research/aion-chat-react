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

/** Derive thread activity from its latest accepted task; older tasks cannot keep it busy. */
export function conversationActivity(
  thread: ReturnType<typeof selectConversationThread>,
): AionActivityPhase | undefined {
  const task = thread?.latestTaskId ? thread.tasks[thread.latestTaskId] : undefined;
  if (!task) return undefined;
  if (
    task.state === "TASK_STATE_INPUT_REQUIRED" ||
    task.state === "TASK_STATE_AUTH_REQUIRED"
  )
    return "requires-action";
  if (!isTerminalTask(task.state)) return "pending";
  return task.state === "TASK_STATE_COMPLETED" && thread?.completedUntil
    ? "succeeded"
    : undefined;
}
