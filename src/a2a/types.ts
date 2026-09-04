/** Browser-supported protocol bindings declared by an A2A Agent Card. */
export type DirectAionProtocolBinding = "HTTP+JSON" | "JSONRPC";

/** One callable interface declared by an A2A Agent Card. */
export interface DirectAionAgentInterface {
  readonly url: string;
  readonly protocolBinding: string;
  readonly protocolVersion: string;
  readonly tenant?: string;
}

/** Capabilities used by the direct chat transport. */
export interface DirectAionAgentCapabilities {
  readonly streaming?: boolean;
}

/** Aion's current HTTP security-scheme representation. */
export interface DirectAionHttpSecurityScheme {
  readonly type: string;
  readonly scheme?: string;
  readonly bearerFormat?: string;
}

/** Aion 1.0 security requirement keyed by declared scheme name. */
export interface DirectAionSecurityRequirement {
  readonly schemes: Readonly<
    Record<string, { readonly list: readonly string[] }>
  >;
}

/** Agent Card fields required by the direct browser transport. */
export interface DirectAionAgentCard {
  readonly name: string;
  readonly supportedInterfaces: readonly DirectAionAgentInterface[];
  readonly capabilities: DirectAionAgentCapabilities;
  readonly securitySchemes?: Readonly<
    Record<string, DirectAionHttpSecurityScheme>
  >;
  readonly securityRequirements?: readonly DirectAionSecurityRequirement[];
}

/** Context supplied when the transport requests a bearer credential. */
export interface AionCredentialRequest {
  readonly agentCard: DirectAionAgentCard;
  readonly agentInterface: DirectAionAgentInterface;
  readonly schemeName: string;
  readonly signal: AbortSignal;
}

/** Supplies current bearer credentials without transferring token ownership. */
export interface AionCredentialProvider {
  /**
   * Returns a current bearer token for one secured request.
   *
   * @param request - Agent, interface, scheme, and cancellation context.
   * @returns A token, or `null` when the caller is not authenticated.
   */
  getBearerToken(request: AionCredentialRequest): Promise<string | null>;
}
