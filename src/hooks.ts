import { useContext } from "react";

import {
  type AionChatController,
  type AionChatControllerActions,
  type AionChatControllerState,
} from "./AionChatProvider";
import { AionChatContext } from "./controller-context";

/** Returns the complete headless Aion chat controller. */
export function useAionChat(): AionChatController {
  const controller = useContext(AionChatContext);
  if (!controller) {
    throw new Error("useAionChat must be used inside AionChatProvider.");
  }
  return controller;
}

/** Returns normalized chat state without exposing transport details. */
export function useAionChatState(): AionChatControllerState {
  return useAionChat().state;
}

/** Returns stable chat actions for headless or custom views. */
export function useAionChatActions(): AionChatControllerActions {
  return useAionChat().actions;
}
