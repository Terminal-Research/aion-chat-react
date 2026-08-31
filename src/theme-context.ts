import { createContext } from "react";

/** @internal Theme-owned portal target for future overlay components. */
export const AionChatPortalContext = createContext<HTMLElement | null>(null);
