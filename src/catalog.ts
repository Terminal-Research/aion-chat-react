import type { ChatAgent } from "./model";

/** Identity kinds exposed as selectable Aion chat agents. */
export type AionAgentCatalogIdentityType = "Personal" | "Principal";

/** Distribution networks supported by the authenticated chat catalog. */
export type AionAgentCatalogNetworkType = "A2A" | "Playground";

/** One selectable chat distribution and its parent identity presentation. */
export interface AionAgentCatalogEntry {
  readonly agent: ChatAgent;
  readonly identityId: string;
  readonly distributionId: string;
  readonly organizationId: string;
  readonly identityType: AionAgentCatalogIdentityType;
  readonly atName?: string;
  readonly a2aUrl?: string;
  readonly avatarImageUrl?: string;
}

/** Options for one agent-catalog read. */
export interface AionAgentCatalogListOptions {
  readonly signal?: AbortSignal;
}

/** Caller-scoped source of selectable Aion chat distributions. */
export interface AionAgentCatalog {
  /**
   * Lists caller-visible identities for the catalog's distribution network.
   *
   * @param options Cancellation for this catalog read.
   * @return One entry per matching distribution.
   */
  list(
    options?: AionAgentCatalogListOptions,
  ): Promise<readonly AionAgentCatalogEntry[]>;
}

/** Stable error codes emitted while loading the agent catalog. */
export type AionAgentCatalogErrorCode =
  | "access_denied"
  | "authentication_required"
  | "catalog_failed"
  | "invalid_response";

/** Redaction-safe failure from an agent-catalog adapter. */
export class AionAgentCatalogError extends Error {
  readonly name = "AionAgentCatalogError";

  constructor(
    readonly code: AionAgentCatalogErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
