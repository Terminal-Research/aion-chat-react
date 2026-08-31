import {
  type CSSProperties,
  type HTMLAttributes,
  type PropsWithChildren,
  useMemo,
  useState,
} from "react";

import { AionChatPortalContext } from "./theme-context";

/** CSS properties plus supported semantic Aion chat custom properties. */
export type AionChatThemeStyle = CSSProperties & {
  readonly [key: `--aion-chat-${string}`]: string | number | undefined;
};

/** Props for the shared theme and portal boundary. */
export interface AionChatThemeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  readonly style?: AionChatThemeStyle;
}

/** Provides semantic CSS defaults and a theme-inheriting portal target. */
export function AionChatTheme({
  children,
  className,
  ...props
}: PropsWithChildren<AionChatThemeProps>) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const classes = ["aion-chat-theme", className].filter(Boolean).join(" ");
  const context = useMemo(() => portalContainer, [portalContainer]);

  return (
    <AionChatPortalContext.Provider value={context}>
      <div className={classes} {...props}>
        {children}
        <div
          ref={setPortalContainer}
          className="aion-chat-theme__portal"
          data-aion-chat-portal=""
        />
      </div>
    </AionChatPortalContext.Provider>
  );
}
