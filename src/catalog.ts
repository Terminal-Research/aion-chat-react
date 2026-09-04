import type { ChatAgent } from "./model";

/** Identity kinds exposed as selectable Aion chat agents. */
export type AionAgentCatalogIdentityType = "Personal" | "Principal";

/** One selectable A2A distribution and its parent identity presentation. */
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

/** Caller-scoped source of selectable Aion agents. */
export interface AionAgentCatalog {
  /**
   * Lists the caller-visible identities that have active A2A distributions.
   *
   * @param options Cancellation for this catalog read.
   * @return One entry per active A2A distribution.
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
