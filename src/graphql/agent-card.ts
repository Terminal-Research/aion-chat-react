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

/**
 * Fetches the resolved route card without credentials.
 *
 * @returns The card response, or `undefined` when the target has no card URL.
 */
async function fetchRouteCard(
  result: AionGraphQLResult<AionAgentCardData>,
  signal: AbortSignal,
  fetcher: typeof globalThis.fetch,
): Promise<Response | undefined> {
  if (result.errors?.length || !result.data) {
    throw new Error("The selected agent card could not be resolved.");
  }
  const url = result.data.a2aAgentCardUrl;
  if (url == null) return undefined;
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)
    || parsed.username || parsed.password) {
    throw new Error("The selected agent card URL is invalid.");
  }
  return fetcher(url, {
    headers: { Accept: "application/json" },
    credentials: "omit", redirect: "error", signal,
  });
}

async function readCardCapabilities(
  response: Response,
): Promise<AionAgentCapabilities> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("The selected agent card could not be loaded.");
  }
  const card = await response.json() as { capabilities?: unknown };
  return parseAgentCapabilities(card?.capabilities);
}

/** @internal Loads capabilities from the resolved card, never the identity URL. */
export async function loadAgentCardCapabilities(
  result: AionGraphQLResult<AionAgentCardData>,
  signal: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AionAgentCapabilities> {
  const response = await fetchRouteCard(result, signal, fetcher);
  return response ? readCardCapabilities(response) : {};
}

/**
 * @internal Reads whether Aion ingress will admit streaming on the route.
 *
 * Ingress accepts `SendStreamingMessage` only when the public route card
 * advertises `capabilities.streaming: true`, and treats a missing card as
 * non-streaming. A resolved card without that flag, or a card endpoint that
 * answers 404 (no public card), therefore returns `false`.
 *
 * @param result Agent-card URL lookup for the exact send target.
 * @param signal Cancels the card request.
 * @param fetcher Injectable fetch used for the credentialless card request.
 * @returns `true` or `false` when the route answer is known; `undefined` when
 * the target has no route card URL. Lookup or transport failures reject, and
 * callers must treat them as unknown rather than as non-streaming.
 */
export async function loadRouteStreaming(
  result: AionGraphQLResult<AionAgentCardData>,
  signal: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<boolean | undefined> {
  const response = await fetchRouteCard(result, signal, fetcher);
  if (!response) return undefined;
  if (response.status === 404) {
    await response.body?.cancel();
    return false;
  }
  return (await readCardCapabilities(response)).streaming === true;
}
