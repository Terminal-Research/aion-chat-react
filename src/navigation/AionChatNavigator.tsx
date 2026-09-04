import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import {
  type HTMLAttributes,
  useEffect,
  useRef,
} from "react";

import type { AionAgentCatalogEntry } from "../catalog";
import type { AionConversationSummary } from "../conversations/types";
import { AionAgentList } from "./AionAgentList";
import { AionConversationList } from "./AionConversationList";

/** Visible pane in the controlled one-panel navigator. */
export type AionChatNavigatorView = "agents" | "conversations";

/** Controlled state and actions for the default chat navigator. */
export interface AionChatNavigatorProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  readonly view: AionChatNavigatorView;
  readonly agents: readonly AionAgentCatalogEntry[];
  readonly conversations: readonly AionConversationSummary[];
  readonly selectedAgentId?: string;
  readonly selectedContextId?: string;
  readonly agentTitle?: string;
  readonly catalogLoading?: boolean;
  readonly catalogError?: Error;
  readonly conversationsLoading?: boolean;
  readonly hasMoreConversations?: boolean;
  readonly conversationsError?: Error;
  readonly showBack?: boolean;
  readonly onSelectAgent: (entry: AionAgentCatalogEntry) => void;
  readonly onBack: () => void;
  readonly onNewConversation: () => void;
  readonly onSelectConversation: (contextId: string) => void;
  readonly onRemoveConversation?: (contextId: string) => void;
  readonly onRetryCatalog?: () => void;
  readonly onRetryConversations?: () => void;
  readonly onLoadMoreConversations?: () => void;
}

/**
 * Presents catalog and conversation panes with controlled one-panel motion.
 */
export function AionChatNavigator({
  view,
  agents,
  conversations,
  selectedAgentId,
  selectedContextId,
  agentTitle,
  catalogLoading,
  catalogError,
  conversationsLoading,
  hasMoreConversations,
  conversationsError,
  showBack = true,
  onSelectAgent,
  onBack,
  onNewConversation,
  onSelectConversation,
  onRemoveConversation,
  onRetryCatalog,
  onRetryConversations,
  onLoadMoreConversations,
  className,
  ...props
}: AionChatNavigatorProps) {
  const rootRef = useRef<HTMLElement>(null);
  const conversationFocusRef = useRef<HTMLButtonElement>(null);
  const previousViewRef = useRef(view);
  const focusedAgentIdRef = useRef(selectedAgentId);

  useEffect(() => {
    if (selectedAgentId) {
      focusedAgentIdRef.current = selectedAgentId;
    }
  }, [selectedAgentId]);

  useEffect(() => {
    if (previousViewRef.current === view) {
      return;
    }
    previousViewRef.current = view;
    if (view === "conversations") {
      conversationFocusRef.current?.focus();
      return;
    }
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-aion-agent-id]",
    );
    Array.from(buttons ?? [])
      .find(
        (button) =>
          button.dataset.aionAgentId === focusedAgentIdRef.current,
      )
      ?.focus();
  }, [selectedAgentId, view]);

  return (
    <nav
      ref={rootRef}
      className={["aion-chat__navigator", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Chat navigation"
      data-view={view}
      {...props}
    >
      <div className="aion-chat__navigator-track">
        <section
          className="aion-chat__navigator-panel"
          aria-label="Agents"
          aria-hidden={view !== "agents"}
          inert={view !== "agents" ? true : undefined}
        >
          <header className="aion-chat__navigator-header">
            <div>
              <h2>Agents</h2>
              <p>Select who you want to chat with.</p>
            </div>
          </header>
          <AionAgentList
            entries={agents}
            selectedAgentId={selectedAgentId}
            loading={catalogLoading}
            error={catalogError}
            onSelectAgent={onSelectAgent}
            onRetry={onRetryCatalog}
          />
        </section>
        <section
          className="aion-chat__navigator-panel"
          aria-label="Conversations"
          aria-hidden={view !== "conversations"}
          inert={view !== "conversations" ? true : undefined}
        >
          <header className="aion-chat__navigator-header">
            <div className="aion-chat__navigator-heading">
              {showBack ? (
                <button
                  ref={conversationFocusRef}
                  className="aion-chat__navigator-icon-button"
                  type="button"
                  aria-label="Back to agents"
                  onClick={onBack}
                >
                  <ArrowLeftIcon aria-hidden="true" />
                </button>
              ) : null}
              <div>
                <h2>{agentTitle ?? "Conversations"}</h2>
                <p>Recent conversations</p>
              </div>
            </div>
            <button
              ref={showBack ? undefined : conversationFocusRef}
              className="aion-chat__navigator-new"
              type="button"
              onClick={onNewConversation}
            >
              <PlusIcon aria-hidden="true" />
              New
            </button>
          </header>
          <AionConversationList
            summaries={conversations}
            selectedContextId={selectedContextId}
            loading={conversationsLoading}
            hasMore={hasMoreConversations}
            error={conversationsError}
            onSelectConversation={onSelectConversation}
            onRemoveConversation={onRemoveConversation}
            onRetry={onRetryConversations}
            onLoadMore={onLoadMoreConversations}
          />
        </section>
      </div>
    </nav>
  );
}
