import {
  type HTMLAttributes,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AionChatProvider,
  type AionChatProviderProps,
} from "./AionChatProvider";
import { AionChatView, type AionChatViewProps } from "./AionChatView";
import type { AionAttachmentUploader } from "./attachments";
import type { AionAgentCatalog, AionAgentCatalogEntry } from "./catalog";
import type { AionConversationDirectory } from "./conversations/directory";
import {
  createInMemoryAionConversationStore,
} from "./conversations/memory-store";
import { useAionConversations } from "./conversations/useAionConversations";
import type {
  AionConversationStore,
  AionConversationSummary,
} from "./conversations/types";
import type {
  ChatAgent,
  ChatConversationState,
  ChatMessage,
  ChatPart,
  ContextId,
} from "./model";
import type { AionAgentProfileSource } from "./profile";
import {
  AionChatNavigator,
  type AionChatNavigatorView,
} from "./navigation/AionChatNavigator";
import { AionChatWorkspaceHeader } from "./navigation/AionChatWorkspaceHeader";
import type { AionChatTransport } from "./transport";
import { useAionAgentCatalog } from "./useAionAgentCatalog";

const AionAgentProfileDialog = lazy(() =>
  import("./AionAgentProfile").then((module) => ({
    default: module.AionAgentProfileDialog,
  })),
);

/** Candidate text supplied to a host-owned local command handler. */
export interface AionChatLocalCommandContext {
  readonly text: string;
  readonly agent: ChatAgent;
  readonly conversation: ChatConversationState;
}

/** Local workspace action returned by a host-owned command handler. */
export type AionChatLocalCommandResult =
  | { readonly type: "handled" }
  | { readonly type: "new-conversation" }
  | { readonly type: "message"; readonly text: string };

/** Configuration for the contained catalog, conversations, and chat view. */
export interface AionChatWorkspaceProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onError"> {
  readonly transport: AionChatTransport;
  readonly catalog?: AionAgentCatalog;
  readonly conversationStore?: AionConversationStore;
  readonly conversationDirectory?: AionConversationDirectory;
  readonly fixedAgent?: ChatAgent;
  readonly fixedContextId?: ContextId;
  readonly startNewConversation?: boolean;
  readonly showNavigator?: boolean;
  readonly attachmentUploader?: AionAttachmentUploader;
  readonly chatViewProps?: AionChatViewProps;
  /** Enables the built-in lazy identity profile for selected catalog entries. */
  readonly agentProfileSource?: AionAgentProfileSource;
  /** Overrides the production Aion application root used by profile links. */
  readonly agentProfileAppBaseUrl?: string;
  readonly onAgentChange?: (agent: ChatAgent | undefined) => void;
  /** Overrides the built-in profile action with a host-owned profile view. */
  readonly onViewAgentProfile?: (entry: AionAgentCatalogEntry) => void;
  readonly onContextChange?: (contextId: ContextId | undefined) => void;
  readonly onConversationChange?: (state: ChatConversationState) => void;
  readonly confirmRemoveConversation?: (
    summary: AionConversationSummary,
  ) => boolean | Promise<boolean>;
  readonly onRunStart?: AionChatProviderProps["onRunStart"];
  readonly onRunEnd?: AionChatProviderProps["onRunEnd"];
  readonly onError?: AionChatProviderProps["onError"];
  /** Handles host-defined text commands before they reach the transport. */
  readonly onLocalCommand?: (
    context: AionChatLocalCommandContext,
  ) => AionChatLocalCommandResult | undefined;
  readonly createId?: () => string;
  readonly now?: () => string;
}

function defaultCreateId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function localMessage(
  conversation: ChatConversationState,
  text: string,
  createId: () => string,
  now: () => string,
): ChatConversationState {
  const message: ChatMessage = {
    id: createId(),
    role: "system",
    parts: [{ type: "text", text }],
    contextId: conversation.contextId,
    createdAt: now(),
  };
  return {
    ...conversation,
    messages: [...conversation.messages, message],
    transcript: [
      ...conversation.transcript,
      { type: "message", id: message.id },
    ],
  };
}

function commandText(parts: readonly ChatPart[]): string | undefined {
  return parts.length === 1 && parts[0]?.type === "text"
    ? parts[0].text.trim()
    : undefined;
}

function configurationError(
  fixedAgent: ChatAgent | undefined,
  fixedContextId: string | undefined,
  startNewConversation: boolean,
  catalog: AionAgentCatalog | undefined,
): void {
  if (!fixedAgent && !catalog) {
    throw new Error("AionChatWorkspace requires a catalog or fixedAgent.");
  }
  if (fixedContextId && !fixedAgent) {
    throw new Error("fixedContextId requires fixedAgent.");
  }
  if (fixedContextId && startNewConversation) {
    throw new Error(
      "fixedContextId and startNewConversation cannot be combined.",
    );
  }
}

/**
 * Composes the default one-panel navigator with the shared inline chat view.
 */
export function AionChatWorkspace({
  transport,
  catalog,
  conversationStore,
  conversationDirectory,
  fixedAgent,
  fixedContextId,
  startNewConversation = false,
  showNavigator,
  attachmentUploader,
  chatViewProps,
  agentProfileSource,
  agentProfileAppBaseUrl,
  onAgentChange,
  onViewAgentProfile,
  onContextChange,
  onConversationChange,
  confirmRemoveConversation,
  onRunStart,
  onRunEnd,
  onError,
  onLocalCommand,
  createId,
  now,
  className,
  ...props
}: AionChatWorkspaceProps) {
  configurationError(
    fixedAgent,
    fixedContextId,
    startNewConversation,
    catalog,
  );
  const defaultStore = useMemo(
    () => createInMemoryAionConversationStore(),
    [],
  );
  const store = conversationStore ?? defaultStore;
  const modelId = createId ?? defaultCreateId;
  const currentTime = now ?? defaultNow;
  const catalogState = useAionAgentCatalog(fixedAgent ? undefined : catalog);
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [profileIdentityId, setProfileIdentityId] = useState<string>();
  const [navigatorView, setNavigatorView] =
    useState<AionChatNavigatorView>(fixedAgent ? "conversations" : "agents");
  const selectedEntry = catalogState.entries.find(
    (entry) => entry.agent.id === selectedAgentId,
  );
  const agent = fixedAgent ?? selectedEntry?.agent;
  const conversations = useAionConversations({
    store,
    directory: conversationDirectory,
    agent,
    fixedContextId,
    createId,
    now,
  });
  const startedAgentRef = useRef<string | undefined>(undefined);
  const navigatorVisible =
    !fixedContextId &&
    !startNewConversation &&
    (showNavigator ?? true);

  useEffect(() => {
    if (
      !startNewConversation ||
      !agent ||
      agent.availability !== "available" ||
      (conversations.status !== "ready" &&
        conversations.status !== "error") ||
      conversations.conversation ||
      startedAgentRef.current === agent.id
    ) {
      return;
    }
    startedAgentRef.current = agent.id;
    const contextId = conversations.createConversation();
    onContextChange?.(contextId);
  }, [
    agent,
    conversations,
    onContextChange,
    startNewConversation,
  ]);

  const selectAgent = (entry: AionAgentCatalogEntry) => {
    conversations.clearSelection();
    setProfileIdentityId(undefined);
    setSelectedAgentId(entry.agent.id);
    setNavigatorView("conversations");
    onAgentChange?.(entry.agent);
    onContextChange?.(undefined);
  };

  const returnToAgents = () => {
    conversations.clearSelection();
    setProfileIdentityId(undefined);
    setNavigatorView("agents");
    setSelectedAgentId(undefined);
    onAgentChange?.(undefined);
    onContextChange?.(undefined);
  };

  const createConversation = () => {
    const contextId = conversations.createConversation();
    if (contextId) {
      onContextChange?.(contextId);
    }
  };

  const selectConversation = (contextId: string) => {
    void conversations.selectConversation(contextId);
    onContextChange?.(contextId);
  };

  const updateConversation = (state: ChatConversationState) => {
    conversations.saveConversation(state);
    onConversationChange?.(state);
  };

  const handleBeforeSend: AionChatProviderProps["onBeforeSend"] = (context) => {
    const text = commandText(context.parts);
    const result = text
      ? onLocalCommand?.({
          text,
          agent: context.agent,
          conversation: context.conversation,
        })
      : undefined;
    if (!result) {
      return false;
    }
    if (result.type === "new-conversation") {
      createConversation();
    } else if (result.type === "message") {
      updateConversation(
        localMessage(
          context.conversation,
          result.text,
          modelId,
          currentTime,
        ),
      );
    }
    return true;
  };

  const removeConversation = async (contextId: string) => {
    const summary = conversations.summaries.find(
      (candidate) => candidate.contextId === contextId,
    );
    if (!summary) {
      return;
    }
    const confirmed = confirmRemoveConversation
      ? await confirmRemoveConversation(summary)
      : typeof globalThis.confirm === "function" &&
        globalThis.confirm(`Remove “${summary.title}” from local history?`);
    if (confirmed) {
      await conversations.removeConversation(contextId);
    }
  };

  const viewAgentProfile =
    onViewAgentProfile ??
    (agentProfileSource
      ? (entry: AionAgentCatalogEntry) => {
          setProfileIdentityId(entry.identityId);
        }
      : undefined);

  return (
    <div
      className={["aion-chat__workspace", className]
        .filter(Boolean)
        .join(" ")}
      data-navigation={navigatorVisible || undefined}
      {...props}
    >
      {navigatorVisible ? (
        <AionChatNavigator
          view={fixedAgent ? "conversations" : navigatorView}
          agents={catalogState.entries}
          conversations={conversations.summaries}
          selectedAgentId={agent?.id}
          selectedContextId={conversations.selectedContextId}
          catalogLoading={catalogState.status === "loading"}
          catalogError={catalogState.error}
          conversationsLoading={conversations.status === "loading"}
          hasMoreConversations={conversations.hasMoreConversations}
          conversationsError={conversations.error}
          showBack={!fixedAgent}
          newConversationDisabled={agent?.availability !== "available"}
          onSelectAgent={selectAgent}
          onBack={returnToAgents}
          onNewConversation={createConversation}
          onSelectConversation={selectConversation}
          onRetryCatalog={catalogState.reload}
          onRetryConversations={conversations.reload}
          onLoadMoreConversations={() => {
            void conversations.loadMoreConversations();
          }}
        />
      ) : null}
      <section
        className="aion-chat__workspace-chat"
        aria-label="Conversation"
      >
        {agent ? (
          <AionChatWorkspaceHeader
            agent={agent}
            catalogEntry={selectedEntry}
            canRemoveConversation={Boolean(
              conversations.selectedContextId,
            )}
            onViewAgentProfile={viewAgentProfile}
            onRemoveConversation={() => {
              const contextId = conversations.selectedContextId;
              if (contextId) {
                void removeConversation(contextId);
              }
            }}
          />
        ) : null}
        <div className="aion-chat__workspace-chat-content">
          {agent && conversations.conversation ? (
            <AionChatProvider
              key={`${agent.id}:${conversations.conversation.contextId}`}
              transport={transport}
              attachmentUploader={attachmentUploader}
              agent={agent}
              conversation={conversations.conversation}
              onConversationChange={updateConversation}
              onRunStart={onRunStart}
              onRunEnd={onRunEnd}
              onError={onError}
              onBeforeSend={onLocalCommand ? handleBeforeSend : undefined}
              createId={createId}
              now={now}
            >
              <AionChatView {...chatViewProps} />
            </AionChatProvider>
          ) : (
            <div className="aion-chat__workspace-empty">
              <p>
                {agent
                  ? "Select or start a conversation."
                  : "Select an Aion to begin."}
              </p>
            </div>
          )}
        </div>
      </section>
      {profileIdentityId && agentProfileSource ? (
        <Suspense fallback={null}>
          <AionAgentProfileDialog
            open
            identityId={profileIdentityId}
            source={agentProfileSource}
            appBaseUrl={agentProfileAppBaseUrl}
            onClose={() => setProfileIdentityId(undefined)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
