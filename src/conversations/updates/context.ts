import { createContext, useContext } from "react";
import type { AionConversationDirectory } from "../directory";
import type { ConversationUpdatesStore } from "./store";

/** Workspace-owned store and read boundary; no module-global mutable store. */
export const ConversationUpdatesContext = createContext<
  | {
      readonly store: ConversationUpdatesStore;
      readonly directory?: AionConversationDirectory;
    }
  | undefined
>(undefined);

/** Read the optional workspace scope; standalone navigation remains supported. */
export function useConversationUpdatesContext() {
  return useContext(ConversationUpdatesContext);
}
