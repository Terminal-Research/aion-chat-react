import { createContext } from "react";

import type { AionChatController } from "./AionChatProvider";

/** @internal Shared context consumed by the public headless hooks. */
export const AionChatContext = createContext<AionChatController | undefined>(
  undefined,
);
