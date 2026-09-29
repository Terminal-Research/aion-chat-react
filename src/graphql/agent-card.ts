import { parseAgentCapabilities, type AionAgentCapabilities } from "../agent-capabilities";
import type { AionChatGraphQLTarget, AionGraphQLResult } from "./types";

/** Resolves the authorized card URL using the message target, including aliases. */
export const AION_AGENT_CARD_QUERY_SOURCE = `
  query AionChatAgentCard($target: CapabilitySubjectGQLInput!, $principal: String) {
    a2aAgentCardUrl(target: $target, principal: $principal)
  }
`;

export interface AionAgentCardData {
  readonly a2aAgentCardUrl?: string | null;
}

export interface AionAgentCardVariables {
  readonly target: AionChatGraphQLTarget;
  readonly principal?: string;
}

/** @internal Loads capabilities from the resolved card, never the identity URL. */
export async function loadAgentCardCapabilities(
  result: AionGraphQLResult<AionAgentCardData>,
  signal: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AionAgentCapabilities> {
  if (result.errors?.length || !result.data) {
    throw new Error("The selected agent card could not be resolved.");
  }
  const url = result.data.a2aAgentCardUrl;
  if (url == null) return {};
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)
    || parsed.username || parsed.password) {
    throw new Error("The selected agent card URL is invalid.");
  }
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    credentials: "omit", redirect: "error", signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("The selected agent card could not be loaded.");
  }
  const card = await response.json() as { capabilities?: unknown };
  return parseAgentCapabilities(card?.capabilities);
}
