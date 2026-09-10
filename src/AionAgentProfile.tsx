import { BrowserIcon } from "@phosphor-icons/react/Browser";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ArrowSquareOut";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/EnvelopeSimple";
import { GithubLogoIcon } from "@phosphor-icons/react/GithubLogo";
import { GlobeIcon } from "@phosphor-icons/react/Globe";
import { PhoneIcon } from "@phosphor-icons/react/Phone";
import { SlackLogoIcon } from "@phosphor-icons/react/SlackLogo";
import { TelegramLogoIcon } from "@phosphor-icons/react/TelegramLogo";
import { VideoCameraIcon } from "@phosphor-icons/react/VideoCamera";
import { XLogoIcon } from "@phosphor-icons/react/XLogo";
import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";

import { AionAgentAvatar } from "./AionAgentAvatar";
import { AionChatDialog } from "./AionChatDialog";
import {
  AionAgentProfileError,
  type AionAgentProfileChannel,
  type AionAgentProfileDetail,
  type AionAgentProfileNetworkType,
  type AionAgentProfileSource,
} from "./profile";
import {
  DEFAULT_AION_APP_BASE_URL,
  getAionAgentProfileChannelDestination,
} from "./profile/channel-destination";

/** One host-defined row appended to the shared profile details. */
export interface AionAgentProfileAdditionalDetail {
  readonly id: string;
  readonly label: string;
  readonly value: ReactNode;
  readonly title?: string;
}

interface AionAgentProfileCommonProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  readonly additionalDetails?: readonly AionAgentProfileAdditionalDetail[];
  /** Root used for Aion-owned channel destinations. */
  readonly appBaseUrl?: string;
}

interface AionAgentProfileDetailProps {
  readonly detail: AionAgentProfileDetail;
  readonly identityId?: never;
  readonly source?: never;
}

interface AionAgentProfileLazyProps {
  readonly detail?: never;
  readonly identityId: string;
  readonly source: AionAgentProfileSource;
}

/** Props for either a preloaded or lazily resolved Aion profile. */
export type AionAgentProfileProps = AionAgentProfileCommonProps &
  (AionAgentProfileDetailProps | AionAgentProfileLazyProps);

/** Props for the shared Aion profile modal. */
export type AionAgentProfileDialogProps = AionAgentProfileProps & {
  readonly open: boolean;
  readonly onClose: () => void;
};

interface ProfileLoadResult {
  readonly identityId: string;
  readonly request: number;
  readonly detail?: AionAgentProfileDetail;
  readonly error?: Error;
}

function displayName(detail: AionAgentProfileDetail): string {
  return detail.identity.name ?? detail.identity.atName ?? detail.identity.id;
}

function atName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return `@${value.replace(/^@/u, "")}`;
}

function websiteHref(value: string | undefined): string | undefined {
  const website = value?.trim();
  if (!website) {
    return undefined;
  }
  try {
    const url = new URL(
      /^[a-zA-Z][a-zA-Z\d+.-]*:/u.test(website)
        ? website
        : `https://${website}`,
    );
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function channelIcon(networkType: AionAgentProfileNetworkType): ReactNode {
  switch (networkType) {
    case "GitHub":
      return <GithubLogoIcon aria-hidden="true" />;
    case "Slack":
      return <SlackLogoIcon aria-hidden="true" />;
    case "Telegram":
    case "TelegramBot":
      return <TelegramLogoIcon aria-hidden="true" />;
    case "Twitter":
      return <XLogoIcon aria-hidden="true" />;
    case "Voice":
      return <PhoneIcon aria-hidden="true" />;
    case "AgentMail":
      return <EnvelopeSimpleIcon aria-hidden="true" />;
    case "Meet":
      return <VideoCameraIcon aria-hidden="true" />;
    case "Playground":
      return <BrowserIcon aria-hidden="true" />;
    case "A2A":
    case "Aion":
      return <ChatCircleDotsIcon aria-hidden="true" />;
  }
}

function channelName(channel: AionAgentProfileChannel): string {
  return (
    channel.serviceIdentity?.name ??
    channel.serviceIdentity?.userName ??
    channel.networkType
  );
}

interface ChannelProps {
  readonly appBaseUrl: string;
  readonly channel: AionAgentProfileChannel;
}

function Channel({ appBaseUrl, channel }: ChannelProps) {
  const name = channelName(channel);
  const username = atName(channel.serviceIdentity?.userName);
  const scope = [channel.projectName, channel.agentEnvironmentName]
    .filter(Boolean)
    .join(" · ");
  const destination = getAionAgentProfileChannelDestination(
    channel,
    appBaseUrl,
  );
  const content = (
    <>
      <span className="aion-chat__profile-channel-icon">
        {channelIcon(channel.networkType)}
      </span>
      <span className="aion-chat__profile-channel-content">
        <span className="aion-chat__profile-channel-heading">
          <strong>{name}</strong>
          {name === channel.networkType ? null : (
            <span>{channel.networkType}</span>
          )}
        </span>
        {username ? <span>{username}</span> : null}
        {scope ? <span>{scope}</span> : null}
      </span>
      {destination ? (
        <span className="aion-chat__profile-channel-action" aria-hidden="true">
          <ArrowSquareOutIcon />
        </span>
      ) : null}
    </>
  );
  return (
    <li>
      {destination ? (
        <a
          className="aion-chat__profile-channel"
          href={destination.href}
          rel="noreferrer"
          target={destination.target === "external" ? "_blank" : undefined}
          title={destination.label}
          aria-label={`${destination.label}: ${name}`}
        >
          {content}
        </a>
      ) : (
        <div className="aion-chat__profile-channel">{content}</div>
      )}
    </li>
  );
}

interface ProfileContentProps extends AionAgentProfileCommonProps {
  readonly detail: AionAgentProfileDetail;
}

function ProfileContent({
  detail,
  additionalDetails = [],
  appBaseUrl = DEFAULT_AION_APP_BASE_URL,
  className,
  ...props
}: ProfileContentProps) {
  const { identity, channels } = detail;
  const channelsTitleId = useId();
  const name = displayName(detail);
  const username = atName(identity.atName);
  const biography = identity.biography?.trim();
  const email = identity.email?.trim();
  const website = websiteHref(identity.website);
  return (
    <article
      className={["aion-chat__profile", className].filter(Boolean).join(" ")}
      aria-label={`${name} profile`}
      {...props}
    >
      {identity.backgroundImageUrl ? (
        <div className="aion-chat__profile-background" aria-hidden="true">
          <img src={identity.backgroundImageUrl} alt="" />
        </div>
      ) : null}
      <section className="aion-chat__profile-summary">
        <AionAgentAvatar
          className="aion-chat__profile-avatar"
          title={name}
          imageUrl={identity.avatarImageUrl}
        />
        <div className="aion-chat__profile-heading">
          <h3>{name}</h3>
          {username ? <p>{username}</p> : null}
        </div>
        {biography ? (
          <p className="aion-chat__profile-biography">
            {biography}
          </p>
        ) : null}
      </section>
      <dl className="aion-chat__profile-details">
        <div>
          <dt>Type</dt>
          <dd>{identity.agentType}</dd>
        </div>
        {identity.identityNetwork ? (
          <div>
            <dt>Network</dt>
            <dd>{identity.identityNetwork}</dd>
          </div>
        ) : null}
        {email ? (
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${email}`}>{email}</a>
            </dd>
          </div>
        ) : null}
        {website ? (
          <div>
            <dt>Website</dt>
            <dd>
              <a href={website} target="_blank" rel="noreferrer">
                {identity.website}
                <GlobeIcon aria-hidden="true" />
              </a>
            </dd>
          </div>
        ) : null}
        {additionalDetails.map((item) => (
          <div key={item.id} title={item.title}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <section
        className="aion-chat__profile-channels"
        aria-labelledby={channelsTitleId}
      >
        <h3 id={channelsTitleId}>Channels</h3>
        {channels.length ? (
          <ul>
            {channels.map((channel) => (
              <Channel
                key={channel.distributionId}
                appBaseUrl={appBaseUrl}
                channel={channel}
              />
            ))}
          </ul>
        ) : (
          <p>No active channels.</p>
        )}
      </section>
    </article>
  );
}

function LazyProfile({
  identityId,
  source,
  ...props
}: AionAgentProfileCommonProps & AionAgentProfileLazyProps) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<ProfileLoadResult>();
  const current =
    result?.identityId === identityId && result.request === request
      ? result
      : undefined;

  useEffect(() => {
    const controller = new AbortController();
    source.load(identityId, { signal: controller.signal }).then(
      (detail) => {
        if (!controller.signal.aborted) {
          setResult({ identityId, request, detail });
        }
      },
      (value: unknown) => {
        if (!controller.signal.aborted) {
          const error =
            value instanceof Error
              ? value
              : new Error("The Aion profile could not be loaded.");
          setResult({ identityId, request, error });
        }
      },
    );
    return () => controller.abort();
  }, [identityId, request, source]);

  if (current?.detail) {
    return <ProfileContent detail={current.detail} {...props} />;
  }
  if (current?.error) {
    const retryable =
      !(current.error instanceof AionAgentProfileError) ||
      current.error.retryable;
    return (
      <div className="aion-chat__profile-status" role="alert">
        <p>{current.error.message}</p>
        {retryable ? (
          <button
            type="button"
            onClick={() => setRequest((value) => value + 1)}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="aion-chat__profile-status" role="status">
      Loading Aion profile…
    </div>
  );
}

/** Renders a preloaded profile or lazily resolves one from its identity ID. */
export function AionAgentProfile(props: AionAgentProfileProps) {
  if (props.detail) {
    const { detail, ...contentProps } = props;
    return <ProfileContent detail={detail} {...contentProps} />;
  }
  return <LazyProfile {...props} />;
}

/** Renders an Aion profile in the shared modal shell when open. */
export function AionAgentProfileDialog({
  open,
  onClose,
  ...profileProps
}: AionAgentProfileDialogProps) {
  if (!open) {
    return null;
  }
  return (
    <AionChatDialog
      className="aion-chat__profile-dialog"
      title="Aion Profile"
      closeLabel="Close Aion profile"
      onRequestClose={onClose}
    >
      <AionAgentProfile {...profileProps} />
    </AionChatDialog>
  );
}
