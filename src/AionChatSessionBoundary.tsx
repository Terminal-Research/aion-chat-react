import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { AionSessionCredentials } from "./a2a/anonymous-session";

/** Wrap the entire workspace so identity changes reset history and active runs. */
export interface AionChatSessionBoundaryProps {
  readonly credentials: AionSessionCredentials;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Guest lifecycle notices and account/guest isolation for direct chat hosts.
 * Hosts retain ownership of credentials and dispose them on source teardown.
 * Conversation stores must also be scoped by credentials.getSnapshot().scopeKey.
 */
export function AionChatSessionBoundary({
  credentials, children, className,
}: AionChatSessionBoundaryProps) {
  const state = useSyncExternalStore(credentials.subscribe,
    credentials.getSnapshot, credentials.getSnapshot);
  useEffect(() => {
    void credentials.prepare().catch(() => undefined);
  }, [credentials, state.mode]);
  const replace = state.notice === "expired" || state.notice === "rejected";
  const message = state.notice === "expired"
    ? "Your guest session has expired."
    : state.notice === "rejected"
      ? "Your guest session was rejected."
      : "The guest session could not be refreshed. Please try again.";
  return (
    <div className={className}>
      {state.notice && (
        <div className="aion-chat__navigation-status" role="status">
          <p>{message}</p>
          {replace && <p>Starting a new session loses access to previous guest conversations.</p>}
          <button type="button" onClick={() => {
            const action = replace ? credentials.startNewSession : credentials.retry;
            void action().catch(() => undefined);
          }}>{replace ? "Start new session" : "Retry"}</button>
        </div>
      )}
      {!state.ready && !state.notice && <p role="status">Preparing guest session…</p>}
      {state.ready && <Fragment key={state.scopeKey}>{children}</Fragment>}
    </div>
  );
}
