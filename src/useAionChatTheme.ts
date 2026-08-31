import { useContext } from "react";

import { AionChatPortalContext } from "./theme-context";

/** Returns the portal container owned by the nearest Aion chat theme. */
export function useAionChatPortalContainer(): HTMLElement | null {
  return useContext(AionChatPortalContext);
}
