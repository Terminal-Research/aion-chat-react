import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { XCircleIcon } from "@phosphor-icons/react/XCircle";
import {
  type ComponentType,
  type HTMLAttributes,
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ChatConversationState, ChatPart } from "../model";

/** Visual phases supported by the generic lifecycle indicator. */
export type AionActivityPhase =
  | "pending"
  | "succeeded"
  | "requires-action"
  | "failed";

/** Package-neutral props accepted by a replaceable activity icon. */
export interface AionActivityIconProps {
  readonly className?: string;
  readonly "aria-hidden"?: boolean | "true" | "false";
}

/** Replaceable icon set for lifecycle phases. */
export type AionActivityIcons = Partial<
  Readonly<Record<AionActivityPhase, ComponentType<AionActivityIconProps>>>
>;

/** Props for one visible lifecycle indicator. */
export interface AionActivityIndicatorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly phase: AionActivityPhase;
  readonly label: string;
  readonly icons?: AionActivityIcons;
}

/** Props for the response-waiting adapter used by the default chat view. */
export interface AionResponseActivityProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly conversation: ChatConversationState;
  readonly icons?: AionActivityIcons;
  readonly settleDurationMs?: number;
}

interface ResponseActivityState {
  readonly phase: AionActivityPhase;
  readonly label: string;
}

const DEFAULT_ICONS: Readonly<
  Record<AionActivityPhase, ComponentType<AionActivityIconProps>>
> = {
  pending: SpinnerGapIcon,
  succeeded: CheckCircleIcon,
  "requires-action": WarningCircleIcon,
  failed: XCircleIcon,
};

function hasContent(parts: readonly ChatPart[]): boolean {
  return parts.some((part) => part.type !== "text" || part.text.length > 0);
}

function responseActivity(
  conversation: ChatConversationState,
): ResponseActivityState | undefined {
  const run = conversation.activeRun;
  if (!run) {
    return undefined;
  }
  const turn = conversation.turns.find(
    (candidate) => candidate.id === run.turnId,
  );
  const activeThinking = turn?.artifactIds.some((id) => {
    const artifact = conversation.artifacts[id];
    return (
      artifact?.artifactId === "aion:thinking-delta" && !artifact.lastChunk
    );
  });
  if (activeThinking) {
    return undefined;
  }
  const assistantMessageIds = new Set(turn?.assistantMessageIds);
  const hasAssistantOutput = conversation.messages.some(
    (message) =>
      assistantMessageIds.has(message.id) && hasContent(message.parts),
  );
  const hasArtifactOutput = turn?.artifactIds.some((id) => {
    const artifact = conversation.artifacts[id];
    return Boolean(
      artifact &&
        artifact.artifactId !== "aion:thinking-delta" &&
        hasContent(artifact.parts),
    );
  });

  switch (run.status) {
    case "running":
      return hasAssistantOutput || hasArtifactOutput
        ? { phase: "succeeded", label: "Response started" }
        : { phase: "pending", label: "Waiting for the agent" };
    case "input-required":
      return {
        phase: "requires-action",
        label: "The agent needs more information",
      };
    case "auth-required":
      return {
        phase: "requires-action",
        label: "Authentication is required to continue",
      };
    case "completed":
      return { phase: "succeeded", label: "Response complete" };
    case "failed":
      return { phase: "failed", label: "Response failed" };
    case "canceled":
      return undefined;
  }
}

/** Renders one lifecycle phase with a Phosphor default or host icon. */
export const AionActivityIndicator = memo(function AionActivityIndicator({
  phase,
  label,
  icons,
  className,
  role = "status",
  ...props
}: AionActivityIndicatorProps) {
  const Icon = icons?.[phase] ?? DEFAULT_ICONS[phase];

  return (
    <div
      className={["aion-chat__indicator", className]
        .filter(Boolean)
        .join(" ")}
      data-activity-phase={phase}
      role={role}
      {...props}
    >
      <Icon className="aion-chat__indicator-icon" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
});

/**
 * Adapts normalized turn state to the response indicator and briefly retains
 * success only when this mounted view previously observed the pending request.
 */
export const AionResponseActivity = memo(function AionResponseActivity({
  conversation,
  icons,
  settleDurationMs = 1_200,
  ...props
}: AionResponseActivityProps) {
  const activity = responseActivity(conversation);
  const requestId = conversation.activeRun?.requestId;
  const waitingRequestRef = useRef<string | undefined>(undefined);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!requestId) {
      waitingRequestRef.current = undefined;
      setShowSuccess(false);
      return;
    }
    if (activity?.phase === "pending") {
      waitingRequestRef.current = requestId;
      setShowSuccess(false);
      return;
    }
    if (
      activity?.phase !== "succeeded" ||
      waitingRequestRef.current !== requestId
    ) {
      setShowSuccess(false);
      return;
    }

    setShowSuccess(true);
    const timeout = window.setTimeout(
      () => setShowSuccess(false),
      settleDurationMs,
    );
    return () => window.clearTimeout(timeout);
  }, [activity?.phase, requestId, settleDurationMs]);

  if (!activity || (activity.phase === "succeeded" && !showSuccess)) {
    return null;
  }

  return (
    <AionActivityIndicator
      {...props}
      phase={activity.phase}
      label={activity.label}
      icons={icons}
    />
  );
});
