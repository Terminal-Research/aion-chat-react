import {
  AionAgentCatalogError,
  type AionAgentCatalogEntry,
  type AionAgentCatalogIdentityType,
} from "../catalog";
import { collectGraphQLErrorMessages } from "./error-messages";
import type { AionGraphQLResult } from "./types";

/** Variables required by the authenticated agent-catalog operation. */
export interface AionAgentCatalogGraphQLVariables {
  readonly organizationId: string;
}

/** Minimal response selected by the authenticated agent-catalog operation. */
export interface AionAgentCatalogGraphQLData {
  readonly agentIdentityDetails?: unknown;
}

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

function invalidResponse(): AionAgentCatalogError {
  return new AionAgentCatalogError(
    "invalid_response",
    "The Aion agent catalog returned an invalid response.",
    false,
  );
}

function identityType(
  value: unknown,
): AionAgentCatalogIdentityType | undefined {
  return value === "Personal" || value === "Principal" ? value : undefined;
}

function compareEntries(
  left: AionAgentCatalogEntry,
  right: AionAgentCatalogEntry,
): number {
  const byTitle = left.agent.title.localeCompare(right.agent.title);
  return byTitle || left.distributionId.localeCompare(right.distributionId);
}

/** Converts a minimal GraphQL result into selectable distribution entries. */
export function normalizeAionAgentCatalog(
  result: AionGraphQLResult<AionAgentCatalogGraphQLData>,
  organizationId: string,
): readonly AionAgentCatalogEntry[] {
  if (result.errors?.length) {
    throw toAionAgentCatalogError(result.errors);
  }
  const details = result.data?.agentIdentityDetails;
  if (!Array.isArray(details)) {
    throw invalidResponse();
  }

  const entries = new Map<string, AionAgentCatalogEntry>();
  for (const rawDetail of details) {
    const detail = record(rawDetail);
    const identity = record(detail?.identity);
    const identityId = requiredString(identity?.id);
    const organization = requiredString(identity?.organizationId);
    const type = identityType(identity?.agentType);
    const name = requiredString(identity?.name);
    const usages = detail?.distributionUsages;
    if (
      !detail ||
      !identity ||
      !identityId ||
      !organization ||
      !type ||
      !name ||
      !Array.isArray(usages) ||
      organization !== organizationId
    ) {
      throw invalidResponse();
    }

    for (const rawUsage of usages) {
      const usage = record(rawUsage);
      const distributionId = requiredString(usage?.distributionId);
      const networkType = requiredString(usage?.networkType);
      if (!usage || !distributionId || !networkType) {
        throw invalidResponse();
      }
      if (networkType !== "A2A") {
        continue;
      }
      const entry: AionAgentCatalogEntry = {
        agent: {
          id: distributionId,
          title: name,
          description: optionalString(identity.biography),
          availability: "available",
        },
        identityId,
        distributionId,
        organizationId: organization,
        identityType: type,
        atName: optionalString(identity.atName),
        a2aUrl: optionalString(identity.a2aUrl),
        avatarImageUrl: optionalString(identity.avatarImageUrl),
      };
      const existing = entries.get(distributionId);
      if (existing && existing.identityId !== identityId) {
        throw invalidResponse();
      }
      entries.set(distributionId, entry);
    }
  }
  return Array.from(entries.values()).sort(compareEntries);
}

function abortError(value: unknown): value is DOMException {
  const candidate = record(value);
  return (
    candidate?.name === "AbortError" &&
    typeof candidate.message === "string"
  );
}

/** Maps transport or GraphQL failures to a redaction-safe catalog error. */
export function toAionAgentCatalogError(
  value: unknown,
): Error | DOMException {
  if (value instanceof AionAgentCatalogError || abortError(value)) {
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
    return new AionAgentCatalogError(
      "authentication_required",
      "Authentication is required to load the Aion agent catalog.",
      false,
    );
  }
  if (
    messages.some((message) =>
      /access_denied|forbidden|access denied|\b403\b/.test(message),
    )
  ) {
    return new AionAgentCatalogError(
      "access_denied",
      "Access to the Aion agent catalog was denied.",
      false,
    );
  }
  return new AionAgentCatalogError(
    "catalog_failed",
    "The Aion agent catalog could not be loaded.",
    true,
  );
}
