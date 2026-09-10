import { DotsThreeVerticalIcon } from "@phosphor-icons/react/DotsThreeVertical";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/EnvelopeSimple";
import { PhoneIcon } from "@phosphor-icons/react/Phone";
import { TrashIcon } from "@phosphor-icons/react/Trash";
import { UserCircleIcon } from "@phosphor-icons/react/UserCircle";
import { useRef } from "react";

import { AionAgentAvatar } from "../AionAgentAvatar";
import type { AionAgentCatalogEntry } from "../catalog";
import type { ChatAgent } from "../model";

interface AionChatWorkspaceHeaderProps {
  readonly agent: ChatAgent;
  readonly catalogEntry?: AionAgentCatalogEntry;
  readonly canRemoveConversation: boolean;
  readonly onViewAgentProfile?: (entry: AionAgentCatalogEntry) => void;
  readonly onRemoveConversation: () => void;
}

/** Renders the selected-Aion title and conversation-level actions. */
export function AionChatWorkspaceHeader({
  agent,
  catalogEntry,
  canRemoveConversation,
  onViewAgentProfile,
  onRemoveConversation,
}: AionChatWorkspaceHeaderProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const canViewProfile = Boolean(catalogEntry && onViewAgentProfile);

  const closeMenu = () => {
    menuRef.current?.removeAttribute("open");
  };

  const viewProfile = () => {
    if (catalogEntry && onViewAgentProfile) {
      onViewAgentProfile(catalogEntry);
      closeMenu();
    }
  };

  const removeConversation = () => {
    onRemoveConversation();
    closeMenu();
  };

  return (
    <header className="aion-chat__workspace-header">
      <div className="aion-chat__workspace-identity">
        <AionAgentAvatar
          className="aion-chat__workspace-avatar"
          title={agent.title}
          imageUrl={agent.avatarImageUrl}
        />
        <h2 className="aion-chat__workspace-title">{agent.title}</h2>
      </div>
      <div className="aion-chat__workspace-actions">
        <button
          className="aion-chat__workspace-action"
          type="button"
          aria-label="Start audio call"
          title="Audio calls are not yet available"
          disabled
        >
          <PhoneIcon aria-hidden="true" />
        </button>
        <button
          className="aion-chat__workspace-action"
          type="button"
          aria-label="Email Aion"
          title="Email is not yet available"
          disabled
        >
          <EnvelopeSimpleIcon aria-hidden="true" />
        </button>
        <details ref={menuRef} className="aion-chat__workspace-menu">
          <summary
            className="aion-chat__workspace-action"
            aria-label="Conversation options"
            title="Conversation options"
          >
            <DotsThreeVerticalIcon aria-hidden="true" />
          </summary>
          <div className="aion-chat__workspace-menu-items">
            <button
              type="button"
              disabled={!canViewProfile}
              onClick={viewProfile}
            >
              <UserCircleIcon aria-hidden="true" />
              View profile
            </button>
            <button
              className="aion-chat__workspace-menu-danger"
              type="button"
              disabled={!canRemoveConversation}
              onClick={removeConversation}
            >
              <TrashIcon aria-hidden="true" />
              Delete chat
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
