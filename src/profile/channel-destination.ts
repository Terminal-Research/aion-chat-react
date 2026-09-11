import type { AionAgentProfileChannel } from "../profile";

/** Production Aion application root used by portable profile links. */
export const DEFAULT_AION_APP_BASE_URL = "https://app.aion.to";

/** A safe action exposed by one profile channel row. */
export interface AionAgentProfileChannelDestination {
  readonly href: string;
  readonly label: string;
  readonly target: "external" | "telephone";
}

/** Inputs shared by Aion-owned profile channel destinations. */
export interface AionAgentProfileChannelDestinationOptions {
  readonly agentIdentityId: string;
  readonly appBaseUrl?: string;
}

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
const X_HOSTS: ReadonlySet<string> = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
]);
const TELEGRAM_HOSTS: ReadonlySet<string> = new Set([
  "t.me",
  "telegram.me",
]);
const GITHUB_HOSTS: ReadonlySet<string> = new Set([
  "github.com",
  "www.github.com",
]);
const SLACK_HOSTS: ReadonlySet<string> = new Set(["app.slack.com"]);

function applicationUrl(path: string, appBaseUrl: string): string {
  let baseUrl: URL;
  try {
    baseUrl = new URL(appBaseUrl);
  } catch {
    throw new TypeError("appBaseUrl must be an absolute HTTP or HTTPS URL.");
  }
  if (
    !WEB_PROTOCOLS.has(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password
  ) {
    throw new TypeError("appBaseUrl must be an absolute HTTP or HTTPS URL.");
  }
  return new URL(path, `${baseUrl.origin}/`).toString();
}

function nativeWebsite(
  website: string | undefined,
  hosts: ReadonlySet<string>,
): string | undefined {
  if (!website?.trim()) {
    return undefined;
  }
  try {
    const url = new URL(
      website.includes("://") ? website : `https://${website}`,
    );
    if (
      !WEB_PROTOCOLS.has(url.protocol) ||
      url.username ||
      url.password ||
      !hosts.has(url.hostname)
    ) {
      return undefined;
    }
    url.protocol = "https:";
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * Resolves one channel to a safe native or Aion-owned destination.
 *
 * @param channel Channel whose service identity supplies native addressing.
 * @param options Parent identity and application root for Aion-owned pages.
 * @returns An actionable destination, or undefined for informational channels.
 */
export function getAionAgentProfileChannelDestination(
  channel: AionAgentProfileChannel,
  {
    agentIdentityId,
    appBaseUrl = DEFAULT_AION_APP_BASE_URL,
  }: AionAgentProfileChannelDestinationOptions,
): AionAgentProfileChannelDestination | undefined {
  if (channel.networkType === "Playground") {
    return {
      href: applicationUrl(
        `/aions/playground/${encodeURIComponent(agentIdentityId)}`,
        appBaseUrl,
      ),
      label: "Open Playground",
      target: "external",
    };
  }
  if (channel.networkType === "A2A") {
    return {
      href: applicationUrl(
        `/aions/agent-cards/${encodeURIComponent(channel.distributionId)}`,
        appBaseUrl,
      ),
      label: "View Agent Card",
      target: "external",
    };
  }

  const identity = channel.serviceIdentity;
  if (!identity) {
    return undefined;
  }
  const username = identity.userName?.trim().replace(/^@/u, "");
  let href: string | undefined;
  let label: string;

  switch (channel.networkType) {
    case "Twitter":
      if (identity.identityNetwork !== "Twitter") {
        return undefined;
      }
      href =
        username && /^[a-zA-Z0-9_]{1,15}$/u.test(username)
          ? `https://x.com/${username}`
          : nativeWebsite(identity.website, X_HOSTS);
      label = "Open X profile";
      break;
    case "Telegram":
    case "TelegramBot":
      if (identity.identityNetwork !== "Telegram") {
        return undefined;
      }
      href =
        username && /^[a-zA-Z0-9_]{5,32}$/u.test(username)
          ? `https://t.me/${username}`
          : nativeWebsite(identity.website, TELEGRAM_HOSTS);
      label = "Open Telegram";
      break;
    case "GitHub":
      if (identity.identityNetwork !== "GitHub") {
        return undefined;
      }
      href =
        username && /^[a-zA-Z0-9-]{1,39}$/u.test(username)
          ? `https://github.com/${username}`
          : nativeWebsite(identity.website, GITHUB_HOSTS);
      label = "Open GitHub profile";
      break;
    case "Slack":
      if (identity.identityNetwork !== "Slack") {
        return undefined;
      }
      href = nativeWebsite(identity.website, SLACK_HOSTS);
      label = "Open Slack";
      break;
    case "Voice": {
      if (identity.identityNetwork !== "Twilio") {
        return undefined;
      }
      const number = [identity.userName, identity.networkUserId]
        .map((value) => value?.trim().replace(/[\s().-]/gu, ""))
        .find((value) => value && /^\+[1-9]\d{6,14}$/u.test(value));
      return number
        ? {
            href: `tel:${number}`,
            label: "Call number",
            target: "telephone",
          }
        : undefined;
    }
    default:
      return undefined;
  }

  return href ? { href, label, target: "external" } : undefined;
}
