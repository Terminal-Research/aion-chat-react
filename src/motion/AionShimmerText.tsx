import { type HTMLAttributes, memo } from "react";

/** Props for an explicitly active thinking-title shimmer. */
export interface AionShimmerTextProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly text: string;
  readonly active: boolean;
}

/** Renders one accessible text node with an optional decorative shimmer. */
export const AionShimmerText = memo(function AionShimmerText({
  text,
  active,
  className,
  ...props
}: AionShimmerTextProps) {
  return (
    <span
      className={["aion-chat__shimmer", className]
        .filter(Boolean)
        .join(" ")}
      data-active={active ? "true" : "false"}
      {...props}
    >
      {text}
    </span>
  );
});
