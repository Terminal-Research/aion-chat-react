import {
  AionAgentProfileError,
  type AionAgentProfileChannel,
  type AionAgentProfileDetail,
  type AionAgentProfileIdentity,
  type AionAgentProfileIdentityType,
  type AionAgentProfileNetworkType,
  type AionAgentProfileServiceIdentity,
} from "../profile";
import { collectGraphQLErrorMessages } from "./error-messages";
import type { AionGraphQLResult } from "./types";

/** Variables required by the lazy Aion profile operation. */
export interface AionAgentProfileGraphQLVariables {
  readonly agentIdentityId: string;
}

/** Minimal response selected by the lazy Aion profile operation. */
export interface AionAgentProfileGraphQLData {
  readonly agentIdentityDetail?: unknown;
}

const IDENTITY_TYPES: ReadonlySet<string> = new Set([
  "Daemon",
  "Personal",
  "Principal",
  "System",
]);

const NETWORK_TYPES: ReadonlySet<string> = new Set([
  "A2A",
  "AgentMail",
  "Aion",
  "GitHub",
  "Meet",
  "Playground",
  "Slack",
  "Telegram",
  "TelegramBot",
  "Twitter",
  "Voice",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function requiredString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const result = value.trim();
  return result || undefined;
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined
    ? undefined
    : requiredString(value);
}

function profileError(
  code: AionAgentProfileError["code"],
  message: string,
  retryable: boolean,
): AionAgentProfileError {
  return new AionAgentProfileError(code, message, retryable);
}

function invalidResponse(): AionAgentProfileError {
  return profileError(
    "invalid_response",
    "The Aion profile endpoint returned an invalid response.",
    false,
  );
}

function identityType(
  value: unknown,
): AionAgentProfileIdentityType | undefined {
  return typeof value === "string" && IDENTITY_TYPES.has(value)
    ? (value as AionAgentProfileIdentityType)
    : undefined;
}

function networkType(
  value: unknown,
): AionAgentProfileNetworkType | undefined {
  return typeof value === "string" && NETWORK_TYPES.has(value)
    ? (value as AionAgentProfileNetworkType)
    : undefined;
}

function normalizeIdentity(value: unknown): AionAgentProfileIdentity {
  const identity = record(value);
  const id = requiredString(identity?.id);
  const agentType = identityType(identity?.agentType);
  const organizationId = requiredString(identity?.organizationId);
  if (!identity || !id || !agentType || !organizationId) {
    throw invalidResponse();
  }
  return {
    id,
    agentType,
    organizationId,
    identityNetwork: optionalString(identity.identityNetwork),
    name: optionalString(identity.name),
    atName: optionalString(identity.atName),
    biography: optionalString(identity.biography),
    avatarImageUrl: optionalString(identity.avatarImageUrl),
    backgroundImageUrl: optionalString(identity.backgroundImageUrl),
    email: optionalString(identity.email),
    website: optionalString(identity.website),
  };
}

function normalizeServiceIdentity(
  value: unknown,
): AionAgentProfileServiceIdentity | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const identity = record(value);
  const id = requiredString(identity?.id);
  const networkUserId = requiredString(identity?.networkUserId);
  if (
    !identity ||
    !id ||
    !networkUserId ||
    typeof identity.systemIdentity !== "boolean"
  ) {
    throw invalidResponse();
  }
  return {
    id,
    networkUserId,
    systemIdentity: identity.systemIdentity,
    identityNetwork: optionalString(identity.identityNetwork),
    userName: optionalString(identity.userName),
    name: optionalString(identity.name),
    website: optionalString(identity.website),
    avatarImageUrl: optionalString(identity.avatarImageUrl),
    biography: optionalString(identity.biography),
  };
}

function normalizeChannel(value: unknown): AionAgentProfileChannel {
  const channel = record(value);
  const distributionId = requiredString(channel?.distributionId);
  const type = networkType(channel?.networkType);
  const projectId = requiredString(channel?.projectId);
  const projectName = requiredString(channel?.projectName);
  if (!channel || !distributionId || !type || !projectId || !projectName) {
    throw invalidResponse();
  }
  return {
    distributionId,
    networkType: type,
    projectId,
    projectName,
    agentEnvironmentId: optionalString(channel.agentEnvironmentId),
    agentEnvironmentName: optionalString(channel.agentEnvironmentName),
    serviceIdentity: normalizeServiceIdentity(channel.serviceIdentity),
  };
}

/** Converts one GraphQL identity detail result into shared profile data. */
export function normalizeAionAgentProfile(
  result: AionGraphQLResult<AionAgentProfileGraphQLData>,
  expectedIdentityId?: string,
): AionAgentProfileDetail {
  if (result.errors?.length) {
    throw toAionAgentProfileError(result.errors);
  }
  if (result.data?.agentIdentityDetail === null) {
    throw profileError(
      "not_found",
      "The requested Aion profile was not found.",
      false,
    );
  }
  const detail = record(result.data?.agentIdentityDetail);
  if (!detail || !Array.isArray(detail.distributionUsages)) {
    throw invalidResponse();
  }
  const identity = normalizeIdentity(detail.identity);
  if (expectedIdentityId && identity.id !== expectedIdentityId) {
    throw invalidResponse();
  }
  return {
    identity,
    channels: detail.distributionUsages.map(normalizeChannel),
  };
}

function abortError(value: unknown): value is DOMException {
  const candidate = record(value);
  return (
    candidate?.name === "AbortError" &&
    typeof candidate.message === "string"
  );
}

/** Maps GraphQL profile failures to a redaction-safe public error. */
export function toAionAgentProfileError(
  value: unknown,
): Error | DOMException {
  if (value instanceof AionAgentProfileError || abortError(value)) {
    return value;
  }
  const messages = collectGraphQLErrorMessages(value).map((message) =>
    message.toLowerCase(),
  );
  if (
    messages.some((message) =>
      /authentication_required|unauthenticated|unauthorized|\b401\b|jwt/.test(
        message,
      ),
    )
  ) {
    return profileError(
      "authentication_required",
      "Authentication is required to load this Aion profile.",
      false,
    );
  }
  if (
    messages.some((message) =>
      /access_denied|forbidden|access denied|\b403\b/.test(message),
    )
  ) {
    return profileError(
      "access_denied",
      "Access to this Aion profile was denied.",
      false,
    );
  }
  return profileError(
    "profile_failed",
    "The Aion profile could not be loaded.",
    true,
  );
}
