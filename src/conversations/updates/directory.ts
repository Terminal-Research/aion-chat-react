import type { AionConversationDirectory } from "../directory";
import type { ConversationUpdatesStore } from "./store";

/** Reconcile authorized metadata at the read boundary, guarding delayed results. */
export function trackConversationDirectory(
  directory: AionConversationDirectory,
  store: ConversationUpdatesStore,
): AionConversationDirectory {
  return {
    async list(agent, options) {
      const revision = store.getState().beginRead();
      const page = await directory.list(agent, options);
      if (!options?.signal?.aborted)
        store.getState().hydrate(agent.id, page.contexts, revision);
      return page;
    },
    async load(agent, contextId, options) {
      const revision = store.getState().beginRead();
      const remote = await directory.load(agent, contextId, options);
      if (!options?.signal?.aborted)
        store.getState().hydrate(
          agent.id,
          [
            {
              contextId,
              lastActivityAt: remote.lastActivityAt,
              title: remote.title,
              summary: remote.summary,
            },
          ],
          revision,
        );
      return remote;
    },
  };
}
