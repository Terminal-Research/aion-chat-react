import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AionAttachmentUploader } from "./attachments";
import type { ChatTransportEvent } from "./events";
import { AionChatContext } from "./controller-context";
import {
  type AttachmentId,
  type ChatAgent,
  type ChatAttachmentDraft,
  type ChatConversationState,
  type ChatError,
  type ChatFilePart,
  type ChatMessage,
  type ChatPart,
  createChatConversationState,
} from "./model";
import { reduceChatConversation } from "./reducer";
import type { AionChatRequest, AionChatTransport } from "./transport";

/** State exposed by the headless Aion chat controller. */
export interface AionChatControllerState {
  readonly agent?: ChatAgent;
  readonly conversation: ChatConversationState;
  readonly draft: string;
  readonly attachments: readonly ChatAttachmentDraft[];
}

/** Derived controller metadata used by chat views. */
export interface AionChatControllerMeta {
  readonly isRunning: boolean;
  readonly isUploading: boolean;
  readonly canSend: boolean;
  readonly canRetry: boolean;
}

/** Optional message input supplied to the controller send action. */
export interface AionChatSendInput {
  readonly parts?: readonly ChatPart[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Commands exposed by the headless Aion chat controller. */
export interface AionChatControllerActions {
  readonly setAgent: (agent: ChatAgent | undefined) => void;
  readonly setDraft: (draft: string) => void;
  readonly addAttachments?: (files: readonly File[]) => void;
  readonly removeAttachment: (attachmentId: AttachmentId) => void;
  readonly send: (input?: AionChatSendInput) => Promise<void>;
  readonly stop: () => void;
  readonly retry: () => Promise<void>;
}

/** Complete headless controller consumed by hooks and views. */
export interface AionChatController {
  readonly state: AionChatControllerState;
  readonly actions: AionChatControllerActions;
  readonly meta: AionChatControllerMeta;
}

/** Configuration for the shared Aion chat controller provider. */
export interface AionChatProviderProps {
  readonly transport: AionChatTransport;
  readonly attachmentUploader?: AionAttachmentUploader;
  readonly agent?: ChatAgent | null;
  readonly defaultAgent?: ChatAgent;
  readonly conversation?: ChatConversationState;
  readonly defaultConversationId?: string;
  readonly draft?: string;
  readonly defaultDraft?: string;
  readonly onAgentChange?: (agent: ChatAgent | undefined) => void;
  readonly onConversationChange?: (state: ChatConversationState) => void;
  readonly onDraftChange?: (draft: string) => void;
  readonly onRunStart?: (request: AionChatRequest) => void;
  readonly onRunEnd?: (state: ChatConversationState) => void;
  readonly onError?: (error: ChatError) => void;
  readonly createId?: () => string;
  readonly now?: () => string;
}

function defaultCreateId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function isTerminalEvent(event: ChatTransportEvent): boolean {
  if (
    event.type === "run.completed" ||
    event.type === "run.failed" ||
    event.type === "run.canceled"
  ) {
    return true;
  }

  if (
    event.type === "task.received" ||
    event.type === "task.status-changed"
  ) {
    const state =
      event.type === "task.received" ? event.task.status.state : event.state;
    return [
      "input-required",
      "auth-required",
      "completed",
      "failed",
      "canceled",
      "rejected",
    ].includes(state);
  }

  return false;
}

function toChatError(error: unknown): ChatError {
  if (error instanceof Error) {
    return {
      code: "transport_error",
      message: error.message || "The chat request failed.",
      retryable: true,
    };
  }

  return {
    code: "transport_error",
    message: "The chat request failed.",
    retryable: true,
  };
}

function toAttachmentError(): ChatError {
  return {
    code: "attachment_upload_failed",
    message: "The attachment could not be uploaded.",
    retryable: true,
  };
}

function updateAttachmentDraft(
  attachments: readonly ChatAttachmentDraft[],
  attachmentId: AttachmentId,
  update: (attachment: ChatAttachmentDraft) => ChatAttachmentDraft,
): readonly ChatAttachmentDraft[] {
  let changed = false;
  const next = attachments.map((attachment) => {
    if (attachment.id !== attachmentId) {
      return attachment;
    }
    changed = true;
    return update(attachment);
  });
  return changed ? next : attachments;
}

function isUploadedAttachment(
  attachment: ChatAttachmentDraft,
): attachment is Extract<ChatAttachmentDraft, { readonly status: "uploaded" }> {
  return attachment.status === "uploaded";
}

function toFilePart(
  attachment: Extract<
    ChatAttachmentDraft,
    { readonly status: "uploaded" }
  >,
): ChatFilePart {
  return {
    type: "file",
    file: {
      name: attachment.uploaded.name ?? attachment.file.name,
      mediaType:
        attachment.uploaded.mediaType || attachment.file.type || undefined,
      url: attachment.uploaded.url,
    },
  };
}

function findContinuationTaskId(
  state: ChatConversationState,
): string | undefined {
  return [...state.turns]
    .reverse()
    .flatMap((turn) => [...turn.taskIds].reverse())
    .find((taskId) => {
      const taskState = state.tasks[taskId]?.status.state;
      return taskState === "input-required" || taskState === "auth-required";
    });
}

/** Provides transport-backed normalized state to headless chat consumers. */
export function AionChatProvider({
  children,
  transport,
  attachmentUploader,
  agent: controlledAgent,
  defaultAgent,
  conversation: controlledConversation,
  defaultConversationId = "default",
  draft: controlledDraft,
  defaultDraft = "",
  onAgentChange,
  onConversationChange,
  onDraftChange,
  onRunStart,
  onRunEnd,
  onError,
  createId = defaultCreateId,
  now = defaultNow,
}: PropsWithChildren<AionChatProviderProps>) {
  const selectedControlledAgent = controlledAgent ?? undefined;
  const [localAgent, setLocalAgent] = useState(defaultAgent);
  const [localConversation, setLocalConversation] = useState(() =>
    controlledConversation ??
    createChatConversationState(
      defaultConversationId,
      controlledAgent === null ? undefined : controlledAgent ?? defaultAgent,
    ),
  );
  const [localDraft, setLocalDraft] = useState(defaultDraft);
  const [attachments, setAttachments] = useState<
    readonly ChatAttachmentDraft[]
  >([]);
  const conversationRef = useRef(localConversation);
  const attachmentsRef = useRef(attachments);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const uploadAbortControllersRef = useRef(
    new Map<AttachmentId, AbortController>(),
  );
  const mountedRef = useRef(true);
  const agent =
    controlledAgent === undefined ? localAgent : selectedControlledAgent;
  const conversation = controlledConversation ?? localConversation;
  const draft = controlledDraft ?? localDraft;
  const attachmentScopeRef = useRef({
    agentId: agent?.id,
    conversationId: conversation.id,
  });

  useEffect(() => {
    const uploadAbortControllers = uploadAbortControllersRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      for (const controller of uploadAbortControllers.values()) {
        controller.abort();
      }
      uploadAbortControllers.clear();
    };
  }, []);

  useEffect(() => {
    if (controlledConversation) {
      conversationRef.current = controlledConversation;
    }
  }, [controlledConversation]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = undefined;
    };
  }, [transport]);

  const updateConversation = useCallback(
    (update: (state: ChatConversationState) => ChatConversationState) => {
      const next = update(conversationRef.current);
      conversationRef.current = next;
      if (mountedRef.current) {
        setLocalConversation(next);
        onConversationChange?.(next);
      }
      return next;
    },
    [onConversationChange],
  );

  const setAgent = useCallback(
    (nextAgent: ChatAgent | undefined) => {
      if (controlledAgent === undefined) {
        setLocalAgent(nextAgent);
      }
      onAgentChange?.(nextAgent);
    },
    [controlledAgent, onAgentChange],
  );

  const setDraft = useCallback(
    (nextDraft: string) => {
      if (controlledDraft === undefined) {
        setLocalDraft(nextDraft);
      }
      onDraftChange?.(nextDraft);
    },
    [controlledDraft, onDraftChange],
  );

  const updateAttachments = useCallback(
    (
      update: (
        current: readonly ChatAttachmentDraft[],
      ) => readonly ChatAttachmentDraft[],
    ) => {
      const current = attachmentsRef.current;
      const next = update(current);
      if (next === current) {
        return;
      }
      attachmentsRef.current = next;
      if (mountedRef.current) {
        setAttachments(next);
      }
    },
    [],
  );

  useEffect(() => {
    const scope = attachmentScopeRef.current;
    if (
      scope.agentId === agent?.id &&
      scope.conversationId === conversation.id
    ) {
      return;
    }
    attachmentScopeRef.current = {
      agentId: agent?.id,
      conversationId: conversation.id,
    };
    for (const controller of uploadAbortControllersRef.current.values()) {
      controller.abort();
    }
    uploadAbortControllersRef.current.clear();
    updateAttachments((current) => (current.length > 0 ? [] : current));
  }, [agent?.id, conversation.id, updateAttachments]);

  const removeAttachment = useCallback(
    (attachmentId: AttachmentId) => {
      uploadAbortControllersRef.current.get(attachmentId)?.abort();
      uploadAbortControllersRef.current.delete(attachmentId);
      updateAttachments((current) => {
        const next = current.filter(
          (attachment) => attachment.id !== attachmentId,
        );
        return next.length === current.length ? current : next;
      });
    },
    [updateAttachments],
  );

  const addAttachments = useCallback(
    (files: readonly File[]) => {
      if (
        !attachmentUploader ||
        !agent ||
        abortRef.current ||
        files.length === 0
      ) {
        return;
      }

      const uploads = files.map((file) => {
        const attachment: ChatAttachmentDraft = {
          id: createId(),
          status: "uploading",
          file,
        };
        return { attachment, controller: new AbortController() };
      });
      updateAttachments((current) => [
        ...current,
        ...uploads.map(({ attachment }) => attachment),
      ]);

      for (const { attachment, controller } of uploads) {
        uploadAbortControllersRef.current.set(attachment.id, controller);
        void attachmentUploader
          .upload(attachment.file, { signal: controller.signal })
          .then((uploaded) => {
            if (controller.signal.aborted) {
              return;
            }
            updateAttachments((current) =>
              updateAttachmentDraft(
                current,
                attachment.id,
                (candidate) => ({
                  id: candidate.id,
                  status: "uploaded",
                  file: candidate.file,
                  uploaded,
                }),
              ),
            );
          })
          .catch(() => {
            if (controller.signal.aborted) {
              return;
            }
            updateAttachments((current) =>
              updateAttachmentDraft(
                current,
                attachment.id,
                (candidate) => ({
                  id: candidate.id,
                  status: "failed",
                  file: candidate.file,
                  error: toAttachmentError(),
                }),
              ),
            );
          })
          .finally(() => {
            uploadAbortControllersRef.current.delete(attachment.id);
          });
      }
    },
    [agent, attachmentUploader, createId, updateAttachments],
  );

  const execute = useCallback(
    async (
      turnId: string,
      message: ChatMessage,
      attempt: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => {
      if (!agent || abortRef.current) {
        return;
      }

      const requestId = createId();
      const occurredAt = now();
      const request: AionChatRequest = {
        requestId,
        turnId,
        attempt,
        agent,
        message,
        contextId: conversationRef.current.contextId,
        taskId: findContinuationTaskId(conversationRef.current),
        metadata,
      };
      const abortController = new AbortController();
      abortRef.current = abortController;

      updateConversation((state) =>
        reduceChatConversation(state, {
          type: "run.started",
          eventId: createId(),
          requestId,
          occurredAt,
          turnId,
          attempt,
          userMessage: message,
        }),
      );
      onRunStart?.(request);

      try {
        let terminal = false;
        for await (const event of transport.stream(request, {
          signal: abortController.signal,
        })) {
          if (!mountedRef.current || abortController.signal.aborted) {
            break;
          }
          if (event.requestId !== requestId) {
            continue;
          }

          updateConversation((state) => reduceChatConversation(state, event));
          if (event.type === "run.failed") {
            onError?.(event.error);
          }
          terminal = isTerminalEvent(event);
          if (terminal) {
            break;
          }
        }

        if (!mountedRef.current) {
          return;
        }

        if (abortController.signal.aborted) {
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.canceled",
              eventId: createId(),
              requestId,
              occurredAt: now(),
            }),
          );
        } else if (!terminal) {
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.completed",
              eventId: createId(),
              requestId,
              occurredAt: now(),
            }),
          );
        }
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        if (abortController.signal.aborted) {
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.canceled",
              eventId: createId(),
              requestId,
              occurredAt: now(),
            }),
          );
        } else {
          const chatError = toChatError(error);
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.failed",
              eventId: createId(),
              requestId,
              occurredAt: now(),
              error: chatError,
            }),
          );
          onError?.(chatError);
        }
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = undefined;
        }
      }

      if (mountedRef.current) {
        onRunEnd?.(conversationRef.current);
      }
    },
    [agent, createId, now, onError, onRunEnd, onRunStart, transport, updateConversation],
  );

  const send = useCallback(
    async (input?: AionChatSendInput) => {
      const currentAttachments = attachmentsRef.current;
      if (
        input?.parts === undefined &&
        currentAttachments.some(
          (attachment) => attachment.status !== "uploaded",
        )
      ) {
        return;
      }
      const uploadedAttachments = currentAttachments.filter(
        isUploadedAttachment,
      );
      const parts =
        input?.parts ??
        [
          ...(draft.trim()
            ? [{ type: "text" as const, text: draft.trim() }]
            : []),
          ...uploadedAttachments.map(toFilePart),
        ];
      if (!agent || parts.length === 0 || abortRef.current) {
        return;
      }

      const createdAt = now();
      const message: ChatMessage = {
        id: createId(),
        role: "user",
        parts,
        contextId: conversationRef.current.contextId,
        createdAt,
      };
      setDraft("");
      if (input?.parts === undefined && uploadedAttachments.length > 0) {
        const sentIds = new Set(
          uploadedAttachments.map((attachment) => attachment.id),
        );
        updateAttachments((current) =>
          current.filter(
            (attachment) => !sentIds.has(attachment.id),
          ),
        );
      }
      await execute(createId(), message, 1, input?.metadata);
    },
    [agent, createId, draft, execute, now, setDraft, updateAttachments],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(async () => {
    const activeRun = conversationRef.current.activeRun;
    if (
      !activeRun ||
      activeRun.status !== "failed" ||
      !activeRun.error?.retryable
    ) {
      return;
    }

    const turn = conversationRef.current.turns.find(
      (candidate) => candidate.id === activeRun.turnId,
    );
    const message = conversationRef.current.messages.find(
      (candidate) => candidate.id === turn?.userMessageId,
    );
    if (!turn || !message) {
      return;
    }

    await execute(turn.id, message, activeRun.attempt + 1);
  }, [execute]);

  const isRunning = conversation.activeRun?.status === "running";
  const isUploading = attachments.some(
    (attachment) => attachment.status === "uploading",
  );
  const hasFailedAttachment = attachments.some(
    (attachment) => attachment.status === "failed",
  );
  const hasUploadedAttachment = attachments.some(
    isUploadedAttachment,
  );
  const value = useMemo<AionChatController>(
    () => ({
      state: { agent, conversation, draft, attachments },
      actions: {
        setAgent,
        setDraft,
        addAttachments: attachmentUploader ? addAttachments : undefined,
        removeAttachment,
        send,
        stop,
        retry,
      },
      meta: {
        isRunning,
        isUploading,
        canSend: Boolean(
          agent &&
            !isRunning &&
            !isUploading &&
            !hasFailedAttachment &&
            (draft.trim() || hasUploadedAttachment),
        ),
        canRetry: Boolean(
          conversation.activeRun?.status === "failed" &&
          conversation.activeRun.error?.retryable,
        ),
      },
    }),
    [
      addAttachments,
      agent,
      attachmentUploader,
      attachments,
      conversation,
      draft,
      hasFailedAttachment,
      hasUploadedAttachment,
      isRunning,
      isUploading,
      removeAttachment,
      retry,
      send,
      setAgent,
      setDraft,
      stop,
    ],
  );

  return (
    <AionChatContext.Provider value={value}>
      {children}
    </AionChatContext.Provider>
  );
}
