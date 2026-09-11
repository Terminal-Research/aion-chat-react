import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import type { HTMLAttributes } from "react";

interface AionAgentAvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly title: string;
  readonly imageUrl?: string;
}

function initials(value: string): string {
  const [first = "", second = ""] = value
    .split(/\s+/u)
    .filter(Boolean);
  return `${first[0] ?? ""}${second[0] ?? first[1] ?? ""}`.toUpperCase();
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
