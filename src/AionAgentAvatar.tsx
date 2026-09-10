import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import type { HTMLAttributes } from "react";

interface AionAgentAvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly title: string;
  readonly imageUrl?: string;
}

function initials(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Renders a decorative Aion image with an initials fallback. */
export function AionAgentAvatar({
  title,
  imageUrl,
  className,
  ...props
}: AionAgentAvatarProps) {
  return (
    <span
      className={["aion-chat__agent-avatar", className]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
      {...props}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" />
      ) : (
        <span className="aion-chat__agent-avatar-fallback">
          {initials(title) || <ChatCircleDotsIcon />}
        </span>
      )}
    </span>
  );
}
