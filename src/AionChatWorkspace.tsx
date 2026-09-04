import {
  type HTMLAttributes,
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
  ContextId,
} from "./model";
import {
  AionChatNavigator,
  type AionChatNavigatorView,
} from "./navigation/AionChatNavigator";
import type { AionChatTransport } from "./transport";
import { useAionAgentCatalog } from "./useAionAgentCatalog";

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
  readonly onAgentChange?: (agent: ChatAgent | undefined) => void;
  readonly onContextChange?: (contextId: ContextId | undefined) => void;
  readonly onConversationChange?: (state: ChatConversationState) => void;
  readonly confirmRemoveConversation?: (
    summary: AionConversationSummary,
  ) => boolean | Promise<boolean>;
  readonly onRunStart?: AionChatProviderProps["onRunStart"];
  readonly onRunEnd?: AionChatProviderProps["onRunEnd"];
  readonly onError?: AionChatProviderProps["onError"];
  readonly createId?: () => string;
  readonly now?: () => string;
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
  onAgentChange,
  onContextChange,
  onConversationChange,
  confirmRemoveConversation,
  onRunStart,
  onRunEnd,
  onError,
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
  const catalogState = useAionAgentCatalog(fixedAgent ? undefined : catalog);
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
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
    setSelectedAgentId(entry.agent.id);
    setNavigatorView("conversations");
    onAgentChange?.(entry.agent);
    onContextChange?.(undefined);
  };

  const returnToAgents = () => {
    conversations.clearSelection();
    setNavigatorView("agents");
    setSelectedAgentId(undefined);
    onAgentChange?.(undefined);
    onContextChange?.(undefined);
  };

  const createConversation = () => {
    const contextId = conversations.createConversation();
    onContextChange?.(contextId);
  };

  const selectConversation = (contextId: string) => {
    void conversations.selectConversation(contextId);
    onContextChange?.(contextId);
  };

  const updateConversation = (state: ChatConversationState) => {
    conversations.saveConversation(state);
    onConversationChange?.(state);
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
          agentTitle={agent?.title}
          catalogLoading={catalogState.status === "loading"}
          catalogError={catalogState.error}
          conversationsLoading={conversations.status === "loading"}
          hasMoreConversations={conversations.hasMoreConversations}
          conversationsError={conversations.error}
          showBack={!fixedAgent}
          onSelectAgent={selectAgent}
          onBack={returnToAgents}
          onNewConversation={createConversation}
          onSelectConversation={selectConversation}
          onRemoveConversation={
            conversationDirectory
              ? undefined
              : (contextId) => {
                  void removeConversation(contextId);
                }
          }
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
                : "Select an agent to begin."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
