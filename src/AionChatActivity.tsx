import { type HTMLAttributes, memo } from "react";

import type { ChatError, ChatTask, ChatTaskState } from "./model";

/** Props supplied to a task-activity slot. */
export interface AionChatTaskActivityProps
  extends HTMLAttributes<HTMLElement> {
  readonly task: ChatTask;
}

/** Props supplied to an error slot. */
export interface AionChatErrorProps extends HTMLAttributes<HTMLDivElement> {
  readonly error: ChatError;
}

interface TaskStatusPresentation {
  readonly title: string;
  readonly description: string;
}

function taskStatusPresentation(
  state: ChatTaskState,
): TaskStatusPresentation {
  switch (state) {
    case "submitted":
      return {
        title: "Task submitted",
        description: "The task has been submitted to the agent.",
      };
    case "working":
      return {
        title: "Agent is working",
        description: "The task is still in progress.",
      };
    case "input-required":
      return {
        title: "More information needed",
        description: "Send another message to continue this task.",
      };
    case "auth-required":
      return {
        title: "Authentication required",
        description: "Authenticate before continuing this task.",
      };
    case "completed":
      return {
        title: "Task completed",
        description: "The agent finished this task.",
      };
    case "failed":
      return {
        title: "Task failed",
        description: "The agent could not complete this task.",
      };
    case "canceled":
      return {
        title: "Task canceled",
        description: "This task is no longer running.",
      };
    case "rejected":
      return {
        title: "Task rejected",
        description: "The agent did not accept this task.",
      };
    case "unknown":
      return {
        title: "Unknown task status",
        description:
          "The agent returned a task state this client cannot classify.",
      };
  }
}

/** Renders the latest known lifecycle state for one A2A task. */
export const AionChatTaskActivity = memo(function AionChatTaskActivity({
  task,
  className,
  ...props
}: AionChatTaskActivityProps) {
  const presentation = taskStatusPresentation(task.status.state);

  return (
    <article
      className={["aion-chat__activity", className]
        .filter(Boolean)
        .join(" ")}
      data-task-state={task.status.state}
      {...props}
    >
      <div className="aion-chat__activity-title">{presentation.title}</div>
      <div className="aion-chat__activity-description">
        {presentation.description}
      </div>
      <div className="aion-chat__activity-id">
        Task <code>{task.id}</code>
      </div>
    </article>
  );
});

/** Renders a transport-safe chat error without exposing raw exception data. */
export const AionChatError = memo(function AionChatError({
  error,
  className,
  role = "alert",
  ...props
}: AionChatErrorProps) {
  return (
    <div
      className={["aion-chat__error", className].filter(Boolean).join(" ")}
      role={role}
      data-error-code={error.code}
      {...props}
    >
      {error.message}
    </div>
  );
});
