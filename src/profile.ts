/** Agent identity categories returned by Aion identity detail queries. */
export type AionAgentProfileIdentityType =
  | "Daemon"
  | "Personal"
  | "Principal"
  | "System";

/** Distribution networks represented in an Aion profile. */
export type AionAgentProfileNetworkType =
  | "A2A"
  | "AgentMail"
  | "Aion"
  | "GitHub"
  | "Meet"
  | "Playground"
  | "Slack"
  | "Telegram"
  | "TelegramBot"
  | "Twitter"
  | "Voice";

/** Normalized service identity associated with one distribution channel. */
export interface AionAgentProfileServiceIdentity {
  readonly id: string;
  readonly identityNetwork?: string;
  readonly networkUserId: string;
  readonly userName?: string;
  readonly name?: string;
  readonly website?: string;
  readonly avatarImageUrl?: string;
  readonly biography?: string;
  readonly systemIdentity: boolean;
}

/** One active distribution channel associated with an Aion identity. */
export interface AionAgentProfileChannel {
  readonly distributionId: string;
  readonly networkType: AionAgentProfileNetworkType;
  readonly projectId: string;
  readonly projectName: string;
  readonly agentEnvironmentId?: string;
  readonly agentEnvironmentName?: string;
  readonly serviceIdentity?: AionAgentProfileServiceIdentity;
}

/** Normalized identity fields displayed by the shared Aion profile. */
export interface AionAgentProfileIdentity {
  readonly id: string;
  readonly agentType: AionAgentProfileIdentityType;
  readonly identityNetwork?: string;
  readonly organizationId: string;
  readonly name?: string;
  readonly atName?: string;
  readonly biography?: string;
  readonly avatarImageUrl?: string;
  readonly backgroundImageUrl?: string;
  readonly email?: string;
  readonly website?: string;
}

/** Identity and active channel information returned for one Aion profile. */
export interface AionAgentProfileDetail {
  readonly identity: AionAgentProfileIdentity;
  readonly channels: readonly AionAgentProfileChannel[];
}

/** Options for one lazy profile-detail read. */
export interface AionAgentProfileLoadOptions {
  readonly signal?: AbortSignal;
}

/** Caller-scoped source of lazily loaded Aion profile details. */
export interface AionAgentProfileSource {
  /**
   * Loads one caller-visible identity and its active distribution channels.
   *
   * @param identityId Identity to resolve.
   * @param options Cancellation for this profile read.
   * @return The normalized profile detail.
   */
  load(
    identityId: string,
    options?: AionAgentProfileLoadOptions,
  ): Promise<AionAgentProfileDetail>;
}

/** Stable failures produced by a profile-detail source. */
export type AionAgentProfileErrorCode =
  | "access_denied"
  | "authentication_required"
  | "invalid_response"
  | "not_found"
  | "profile_failed";

/** Redaction-safe failure from an Aion profile-detail source. */
export class AionAgentProfileError extends Error {
  readonly name = "AionAgentProfileError";

  constructor(
    readonly code: AionAgentProfileErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
